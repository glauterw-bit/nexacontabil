import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import axios from 'axios';
import * as zlib from 'zlib';
import { PrismaService } from '../../database/prisma.service';
import { CertificadoDigitalService } from '../certificado-digital/certificado-digital.service';
import { AnaliseClienteService } from '../analise-cliente/analise-cliente.service';

/**
 * BUSCADOR NATIVO NO SEFAZ — NFeDistribuiçãoDFe (ambiente nacional / SVRS).
 *
 * É o serviço oficial que ENTREGA ao destinatário todas as NF-e emitidas contra o
 * CNPJ dele. Consulta incremental por NSU (Número Sequencial Único): a gente pede
 * "tudo a partir do último NSU que li", o SEFAZ devolve um lote compactado, guardamos
 * o novo NSU e continuamos. Sem terceiros — só o certificado A1 do cliente (ou do
 * escritório com procuração e-CAC) via mTLS.
 *
 * Reaproveita: certificado (mTLS) + pipeline de ingestão (parseNfe + validação + Document).
 * Limite de consumo do SEFAZ: ao zerar a fila (ultNSU == maxNSU), só voltar a consultar
 * após ~1h — senão retorna cStat 656 (consumo indevido).
 */
@Injectable()
export class SefazDistribuicaoService {
  private readonly logger = new Logger('SEFAZ-DFe');
  /** Último resultado da varredura/preenchimento de UF — p/ diagnóstico via progresso público. */
  private ultimaVarredura: any = null;
  private ultimoPreencherUF: any = null;
  private ultimoInferirCnpj: any = null;
  /** Clientes cuja inferência fraca já foi REJEITADA na Receita — não reconsultar todo ciclo. */
  private inferenciaRejeitada = new Set<string>();
  // Ambiente Nacional (hospedado no SVRS) — atende a distribuição de NF-e de todas as UFs.
  private readonly url = 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';
  private readonly tpAmb = process.env.SEFAZ_AMBIENTE === '2' ? 2 : 1; // 1=produção
  private readonly PAUSA_MS = 1200;

  // UF → código IBGE (cUFAutor exigido no distDFeInt)
  private readonly UF: Record<string, string> = {
    AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53', ES: '32',
    GO: '52', MA: '21', MT: '51', MS: '50', MG: '31', PA: '15', PB: '25', PR: '41',
    PE: '26', PI: '22', RJ: '33', RN: '24', RS: '43', RO: '11', RR: '14', SC: '42',
    SP: '35', SE: '28', TO: '17',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly certificados: CertificadoDigitalService,
    private readonly analise: AnaliseClienteService,
  ) {}

  private pausa(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

  private get1(re: RegExp, xml: string): string | undefined {
    const m = xml.match(re);
    return m ? m[1] : undefined;
  }

  /** Monta o envelope SOAP 1.2 do nfeDistDFeInteresse. */
  private envelope(cUF: string, cnpj: string, ultNSU: string): string {
    const nsu = ultNSU.padStart(15, '0');
    return `<?xml version="1.0" encoding="UTF-8"?>` +
      `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
      `<soap12:Body>` +
      `<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">` +
      `<nfeDadosMsg>` +
      `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.35">` +
      `<tpAmb>${this.tpAmb}</tpAmb><cUFAutor>${cUF}</cUFAutor><CNPJ>${cnpj}</CNPJ>` +
      `<distNSU><ultNSU>${nsu}</ultNSU></distNSU>` +
      `</distDFeInt></nfeDadosMsg></nfeDistDFeInteresse>` +
      `</soap12:Body></soap12:Envelope>`;
  }

  /** base64(gzip) → XML string. */
  private descompactar(b64: string): string | null {
    try {
      const buf = Buffer.from(b64.trim(), 'base64');
      if (buf[0] === 0x1f && buf[1] === 0x8b) return zlib.gunzipSync(buf).toString('utf8');
      return buf.toString('utf8');
    } catch { return null; }
  }

  /** Status/config da integração (sem certificado não busca). */
  async status(companyId?: string) {
    const base = {
      provider: 'sefaz-distribuicao-dfe',
      ambiente: this.tpAmb === 1 ? 'produção' : 'homologação',
      servico: 'NFeDistribuiçãoDFe (nacional)',
      cobre: ['NF-e (destinatário)'],
      requer: 'Certificado A1 do cliente (ou do escritório + procuração e-CAC) e CNPJ real',
    };
    if (!companyId) return base;
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { cnpj: true, uf: true, sefazUltNSU: true, sefazMaxNSU: true, sefazUltConsultaEm: true },
    });
    let temCertProprio = false;
    try { await this.certificados.getCertificadoAtivo(companyId); temCertProprio = true; } catch { /* sem cert próprio */ }
    const esc = await this.certificados.temEscritorio();
    const temCert = temCertProprio || esc.tem;
    const cnpj = (company?.cnpj ?? '').replace(/\D/g, '');
    return {
      ...base,
      companyId,
      certificadoAtivo: temCert,
      certificadoDoEscritorio: esc.tem && !temCertProprio, // usará o do escritório
      certificadoEscritorio: esc.tem ? { cnpj: esc.cnpj, validade: esc.validade, nome: esc.nome } : null,
      cnpjReal: !!cnpj && !cnpj.startsWith('7'),
      ufDefinida: !!company?.uf,
      ultNSU: company?.sefazUltNSU ?? '0',
      maxNSU: company?.sefazMaxNSU ?? null,
      ultimaConsulta: company?.sefazUltConsultaEm ?? null,
      pronto: temCert && !!cnpj && !cnpj.startsWith('7') && !!company?.uf,
    };
  }

  /** Salva o certificado A1 do ESCRITÓRIO (um só, usado p/ todos via procuração). */
  async salvarCertEscritorio(pfxBase64: string, senha: string, nome: string) {
    const c = await this.certificados.salvarCertificadoEscritorio(pfxBase64, senha, nome);
    return { ok: true, cnpj: c.cnpjCpf, validade: c.dataValidade, nome: c.nome };
  }

  /** Situação do certificado do escritório. */
  async statusEscritorio() {
    return this.certificados.temEscritorio();
  }

  /** O certificado do escritório está USÁVEL (existe E a senha abre o PFX)? */
  async certificadoEscritorioUsavel(): Promise<boolean> {
    try { await this.certificados.getHttpsAgentEscritorio(); return true; } catch { return false; }
  }

  /** Valida dígitos verificadores de CNPJ (14 dígitos). */
  private cnpjValido(cnpj: string): boolean {
    if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
    const calc = (base: string) => {
      let peso = base.length - 7, soma = 0;
      for (const ch of base) { soma += parseInt(ch, 10) * peso; peso = peso === 2 ? 9 : peso - 1; }
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(cnpj.slice(0, 12)) === +cnpj[12] && calc(cnpj.slice(0, 13)) === +cnpj[13];
  }

  /** Compara o nome do cliente com a razão social/fantasia do CNPJ na BrasilAPI. */
  private async nomeConfereNaReceita(cnpj: string, nomeCliente: string): Promise<boolean> {
    const { data } = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { timeout: 12000 });
    const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const IGNORAR = new Set(['LTDA', 'ME', 'MEI', 'EPP', 'EIRELI', 'SA', 'S A', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'EM', 'COM']);
    const tokens = (s: string) => new Set(norm(s).split(' ').filter((t) => t.length >= 3 && !IGNORAR.has(t)));
    const alvo = tokens(nomeCliente);
    if (!alvo.size) return false;
    for (const cand of [data?.razao_social, data?.nome_fantasia]) {
      const ts = tokens(String(cand ?? ''));
      if (!ts.size) continue;
      let comuns = 0;
      for (const t of alvo) if (ts.has(t)) comuns++;
      const minimo = Math.min(alvo.size, ts.size);
      if (comuns >= 2 || comuns >= minimo * 0.6) return true;
    }
    return false;
  }

  /**
   * INFERE O CNPJ REAL de clientes com CNPJ provisório (começa com 7 / inválido), olhando os
   * PRÓPRIOS documentos do cliente: o CNPJ dele aparece como emitente ou destinatário em quase
   * todos os XMLs. Regra conservadora: precisa de ≥3 docs e o CNPJ dominante em ≥60% deles,
   * com dígitos verificadores válidos. Colisão com outro cliente (matriz/filial) é pulada.
   */
  async inferirCnpjsReais(opts?: { minDocs?: number; minShare?: number }) {
    const minDocs = opts?.minDocs ?? 3;
    const minShare = opts?.minShare ?? 0.6;
    const todos = await this.prisma.company.findMany({
      where: { active: true },
      select: { id: true, cnpj: true, name: true },
    });
    const alvos = todos.filter((c) => {
      const n = (c.cnpj ?? '').replace(/\D/g, '');
      return !n || n.length !== 14 || n.startsWith('7') || !this.cnpjValido(n);
    });
    const emUso = new Set(todos.map((c) => (c.cnpj ?? '').replace(/\D/g, '')));

    // CNPJ do escritório nunca é de cliente (aparece em recibos/protocolos da contabilidade)
    const esc = await this.certificados.temEscritorio().catch(() => ({ tem: false }) as any);
    const cnpjEscritorio = ((esc as any)?.cnpj ?? '').replace(/\D/g, '');

    /** Extrai CNPJs válidos de um texto: formatados (12.345.678/0001-90) e janelas de 14
     *  dígitos em sequências numéricas (nomes de guia DAS, chaves de acesso etc.). */
    const minerarDeTexto = (txt: string): Set<string> => {
      const achados = new Set<string>();
      if (!txt) return achados;
      for (const m of txt.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-?\d{2}/g) ?? []) {
        const n = m.replace(/\D/g, '');
        if (this.cnpjValido(n) && n !== cnpjEscritorio) achados.add(n);
      }
      for (const run of txt.match(/\d{14,}/g) ?? []) {
        for (let i = 0; i + 14 <= run.length; i++) {
          const n = run.slice(i, i + 14);
          if (this.cnpjValido(n) && n !== cnpjEscritorio) achados.add(n);
        }
      }
      return achados;
    };

    let inferidos = 0, semDocs = 0, semConsenso = 0, conflitos = 0;
    let apiChecks = 0;
    const MAX_API_CHECKS = 30; // teto de consultas à BrasilAPI por rodada (rate limit)
    const detalhe: any[] = [];
    const amostraDiag: any[] = [];
    for (const c of alvos) {
      // atalho: o próprio NOME do cliente pode trazer o CNPJ (pastas "EMPRESA - 12.345...")
      const doNome = [...minerarDeTexto(c.name ?? '')].filter((n) => !emUso.has(n));
      if (doNome.length === 1) {
        try {
          await this.prisma.company.update({ where: { id: c.id }, data: { cnpj: doNome[0] } });
          emUso.add(doNome[0]); inferidos++;
          detalhe.push({ cliente: c.name, cnpj: doNome[0], fonte: 'nome do cliente' });
          continue;
        } catch { /* segue pro caminho dos docs */ }
      }

      // três sinais independentes: emitente, destinatário e NOME DO ARQUIVO (guias DAS,
      // recibos etc. carregam o CNPJ do cliente no nome). O lado mais dominante decide.
      const docs = await this.prisma.document.findMany({
        where: { companyId: c.id },
        select: { issuerCnpj: true, recipientCnpj: true, originalFilename: true },
        take: 800,
      });
      const contadores = { emit: new Map<string, number>(), dest: new Map<string, number>(), arq: new Map<string, number>() };
      const uteis = { emit: 0, dest: 0, arq: 0 };
      for (const d of docs) {
        const e = ((d.issuerCnpj ?? '') as string).replace(/\D/g, '');
        if (e.length === 14 && this.cnpjValido(e) && e !== cnpjEscritorio) { uteis.emit++; contadores.emit.set(e, (contadores.emit.get(e) ?? 0) + 1); }
        const r = ((d.recipientCnpj ?? '') as string).replace(/\D/g, '');
        if (r.length === 14 && this.cnpjValido(r) && r !== cnpjEscritorio) { uteis.dest++; contadores.dest.set(r, (contadores.dest.get(r) ?? 0) + 1); }
        const doArq = minerarDeTexto(d.originalFilename ?? '');
        if (doArq.size) { uteis.arq++; for (const n of doArq) contadores.arq.set(n, (contadores.arq.get(n) ?? 0) + 1); }
      }
      const lados = (Object.keys(contadores) as Array<keyof typeof contadores>).map((k) => {
        let top: string | null = null, topN = 0;
        for (const [cnpj, n] of contadores[k]) if (n > topN) { top = cnpj; topN = n; }
        return { lado: k, top, topN, uteis: uteis[k], share: uteis[k] ? topN / uteis[k] : 0 };
      });
      const melhor = lados.reduce((a, b) => (b.share > a.share || (b.share === a.share && b.topN > a.topN) ? b : a));
      if (amostraDiag.length < 5) amostraDiag.push({ docs: docs.length, uteis, melhorLado: melhor.lado, share: +melhor.share.toFixed(2), topN: melhor.topN });
      // sinal FRACO (1–2 evidências, mas unânimes): confirma na BrasilAPI comparando a
      // razão social/fantasia com o nome do cliente antes de aceitar.
      if (melhor.top && melhor.topN >= 1 && melhor.topN < minDocs && melhor.share >= 0.99 &&
          !emUso.has(melhor.top) && !this.inferenciaRejeitada.has(c.id) && apiChecks < MAX_API_CHECKS) {
        apiChecks++;
        const bate = await this.nomeConfereNaReceita(melhor.top, c.name).catch(() => false);
        await this.pausa(600);
        if (!bate) this.inferenciaRejeitada.add(c.id); // não reconsultar todo ciclo
        if (bate) {
          try {
            await this.prisma.company.update({ where: { id: c.id }, data: { cnpj: melhor.top } });
            emUso.add(melhor.top); inferidos++;
            detalhe.push({ cliente: c.name, cnpj: melhor.top, fonte: `${melhor.lado}+receita`, presenca: `${melhor.topN} doc(s), razão social confere` });
            this.logger.log(`CNPJ inferido (validado na Receita) p/ ${c.name}: ${melhor.top}`);
            continue;
          } catch { conflitos++; continue; }
        }
        semConsenso++; continue;
      }
      if (melhor.topN < minDocs) { (docs.length < minDocs ? semDocs++ : semConsenso++); continue; }
      if (!melhor.top || melhor.share < minShare) { semConsenso++; continue; }
      if (emUso.has(melhor.top)) { conflitos++; detalhe.push({ cliente: c.name, cnpj: melhor.top, motivo: 'já usado por outro cliente' }); continue; }
      try {
        await this.prisma.company.update({ where: { id: c.id }, data: { cnpj: melhor.top } });
        emUso.add(melhor.top);
        inferidos++;
        detalhe.push({ cliente: c.name, cnpj: melhor.top, fonte: melhor.lado, docs: docs.length, presenca: Math.round(melhor.share * 100) + '%' });
        this.logger.log(`CNPJ inferido p/ ${c.name}: ${melhor.top} (${melhor.lado}: ${melhor.topN}/${melhor.uteis})`);
      } catch { conflitos++; }
    }
    const r = { candidatos: alvos.length, inferidos, semDocs, semConsenso, conflitos, detalhe: detalhe.slice(0, 60) };
    this.ultimoInferirCnpj = { ...r, detalhe: undefined, amostraDiag, em: new Date().toISOString() };
    return r;
  }

  /**
   * PREENCHE A UF que falta em cada cliente (cUFAutor é exigido pelo SEFAZ). Consulta a
   * BrasilAPI pelo CNPJ (mesma fonte já usada no Radar e-CAC) e grava uf/município/cep.
   * Bounded por tempo; roda em rotação até cobrir todos. Idempotente (só mexe em uf null).
   */
  async preencherUFsFaltantes(opts?: { timeBudgetMs?: number; max?: number }) {
    const timeBudgetMs = opts?.timeBudgetMs ?? 60_000;
    const inicio = Date.now();
    const semUF = await this.prisma.company.findMany({
      where: { active: true, uf: null },
      select: { id: true, cnpj: true, name: true },
    });
    let atualizados = 0, falhas = 0, pulados = 0;
    for (const c of semUF) {
      if (Date.now() - inicio > timeBudgetMs) break;
      if (opts?.max && atualizados + falhas >= opts.max) break;
      const cnpj = (c.cnpj ?? '').replace(/\D/g, '');
      if (cnpj.length !== 14 || cnpj.startsWith('7')) { pulados++; continue; }
      try {
        const { data } = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { timeout: 12000 });
        const uf = String(data?.uf ?? '').toUpperCase().trim();
        if (uf && this.UF[uf]) {
          await this.prisma.company.update({
            where: { id: c.id },
            data: {
              uf,
              municipio: data?.municipio ? String(data.municipio) : undefined,
              codigoMunicipio: data?.codigo_municipio_ibge ? String(data.codigo_municipio_ibge) : undefined,
              cep: data?.cep ? String(data.cep).replace(/\D/g, '') : undefined,
            },
          });
          atualizados++;
        } else { falhas++; }
      } catch { falhas++; }
      await this.pausa(600); // respeita o rate limit da BrasilAPI
    }
    const r = { semUF: semUF.length, atualizados, falhas, pulados, restantes: Math.max(0, semUF.length - atualizados) };
    this.ultimoPreencherUF = { ...r, em: new Date().toISOString() };
    return r;
  }

  /**
   * VARREDURA EM LOTE — passa por todos os clientes elegíveis (CNPJ real + UF) e puxa o
   * que der do SEFAZ. Monta o certificado do ESCRITÓRIO UMA vez e reusa (mTLS) p/ todos.
   * Respeita o limite: pula quem já drenou a fila e foi consultado há < 55 min (evita cStat
   * 656). Limitado por tempo (timeBudgetMs) p/ caber num ciclo do scheduler.
   */
  async varrerTodos(opts?: { timeBudgetMs?: number; maxClientes?: number; maxIteracoesPorCliente?: number }) {
    const timeBudgetMs = opts?.timeBudgetMs ?? 5 * 60_000;
    const maxIteracoes = opts?.maxIteracoesPorCliente ?? 30;
    const COOLDOWN_MS = 55 * 60_000;
    const inicio = Date.now();

    // certificado do escritório montado UMA vez (evita reparsear o PFX por cliente)
    let agentEsc: import('https').Agent | undefined;
    const esc = await this.certificados.temEscritorio();
    if (esc.tem) {
      try { agentEsc = await this.certificados.getHttpsAgentEscritorio(); } catch { agentEsc = undefined; }
    }

    const candidatos = await this.prisma.company.findMany({
      where: { active: true, uf: { not: null } },
      select: { id: true, name: true, cnpj: true, uf: true, sefazUltConsultaEm: true, sefazUltNSU: true, sefazMaxNSU: true },
      orderBy: [{ sefazUltConsultaEm: { sort: 'asc', nulls: 'first' } }],
    });

    const agora = Date.now();
    const elegiveis = candidatos.filter((c) => {
      const cnpj = (c.cnpj ?? '').replace(/\D/g, '');
      if (!cnpj || cnpj.startsWith('7')) return false;
      if (!this.UF[(c.uf ?? '').toUpperCase()]) return false;
      // pula quem já chegou ao fim da fila e foi consultado há < 55 min
      if (c.sefazUltConsultaEm && c.sefazUltNSU && c.sefazMaxNSU &&
          BigInt(c.sefazUltNSU) >= BigInt(c.sefazMaxNSU) &&
          (agora - new Date(c.sefazUltConsultaEm).getTime()) < COOLDOWN_MS) return false;
      return true;
    });

    const limite = opts?.maxClientes ?? elegiveis.length;
    let processados = 0, novosTotal = 0, docsTotal = 0, duplicadosTotal = 0, erros = 0, bloqueados656 = 0;
    const detalhe: any[] = [];

    for (const c of elegiveis) {
      if (processados >= limite) break;
      if (Date.now() - inicio > timeBudgetMs) break;
      try {
        const r = await this.buscarCliente(c.id, undefined, maxIteracoes, agentEsc);
        processados++;
        novosTotal += r.novos ?? 0;
        docsTotal += r.docsRecebidos ?? 0;
        duplicadosTotal += r.duplicados ?? 0;
        if (r.cStat === '656') bloqueados656++;
        if ((r.novos ?? 0) > 0 || r.cStat === '656') detalhe.push({ cliente: c.name, novos: r.novos, docs: r.docsRecebidos, cStat: r.cStat });
      } catch (e: any) {
        erros++;
        if (detalhe.length < 60) detalhe.push({ cliente: c.name, erro: (e?.message ?? 'erro').slice(0, 120) });
      }
    }

    const res = {
      temCertificadoEscritorio: esc.tem,
      elegiveis: elegiveis.length,
      processados,
      restantes: Math.max(0, elegiveis.length - processados),
      novosTotal, docsTotal, duplicadosTotal, bloqueados656, erros,
      duracaoS: Math.round((Date.now() - inicio) / 1000),
      detalhe: detalhe.slice(0, 40),
    };
    this.ultimaVarredura = { ...res, em: new Date().toISOString() };
    return res;
  }

  /** Progresso PÚBLICO da varredura do SEFAZ (só contadores) — p/ acompanhar de fora. */
  async progressoPublico() {
    const [totalAtivos, comUF, semUF, jaConsultados, docsSefaz] = await Promise.all([
      this.prisma.company.count({ where: { active: true } }),
      this.prisma.company.count({ where: { active: true, uf: { not: null } } }),
      this.prisma.company.count({ where: { active: true, uf: null } }),
      this.prisma.company.count({ where: { active: true, sefazUltConsultaEm: { not: null } } }),
      this.prisma.document.count({ where: { fileUrl: { startsWith: 'sefaz|' } } }),
    ]);
    const esc = await this.certificados.temEscritorio();
    // amostra de erros da última varredura SEM nomes de clientes (endpoint público)
    const v = this.ultimaVarredura;
    const ultima = v ? {
      em: v.em, processados: v.processados, novos: v.novosTotal, erros: v.erros,
      bloqueados656: v.bloqueados656,
      errosAmostra: (v.detalhe ?? []).filter((d: any) => d.erro).slice(0, 5).map((d: any) => d.erro),
    } : null;
    return {
      certificadoEscritorio: esc.tem ? { cnpj: esc.cnpj, validade: esc.validade } : null,
      clientesAtivos: totalAtivos,
      clientesComUF: comUF,
      clientesSemUF: semUF,
      clientesElegiveis: comUF,
      clientesJaConsultados: jaConsultados,
      docsCapturadosDoSefaz: docsSefaz,
      ultimaVarredura: ultima,
      ultimoPreencherUF: this.ultimoPreencherUF,
      ultimoInferirCnpj: this.ultimoInferirCnpj,
    };
  }

  /**
   * Busca as NF-e do cliente no SEFAZ desde o último NSU e ingere no pipeline.
   * @param maxIteracoes teto de lotes por chamada (cada lote ~ até 50 docs).
   */
  async buscarCliente(companyId: string, senha?: string, maxIteracoes = 20, agentPronto?: import('https').Agent) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, cnpj: true, uf: true, sefazUltNSU: true },
    });
    if (!company) throw new BadRequestException('Cliente não encontrado.');
    const cnpj = (company.cnpj ?? '').replace(/\D/g, '');
    if (!cnpj || cnpj.startsWith('7')) throw new BadRequestException('Cliente sem CNPJ real (provisório começa com 7).');
    const cUF = company.uf ? this.UF[company.uf.toUpperCase()] : undefined;
    if (!cUF) throw new BadRequestException('Defina a UF do cliente (cUFAutor é exigido pelo SEFAZ).');

    // mTLS: usa um agente já montado (varredura em lote reusa o do escritório), senão o
    // certificado PRÓPRIO do cliente se houver, senão o do ESCRITÓRIO (um p/ todos via procuração).
    let httpsAgent: import('https').Agent;
    if (agentPronto) {
      httpsAgent = agentPronto;
    } else {
      try {
        httpsAgent = await this.certificados.getHttpsAgent(companyId, senha);
      } catch {
        try {
          httpsAgent = await this.certificados.getHttpsAgentEscritorio(senha);
        } catch (e: any) {
          throw new BadRequestException('Certificado indisponível: carregue o A1 do cliente OU configure o certificado do ESCRITÓRIO (com procuração e-CAC do cliente).');
        }
      }
    }

    let ultNSU = company.sefazUltNSU ?? '0';
    let maxNSU = ultNSU;
    let novos = 0, duplicados = 0, invalidos = 0, docs = 0, cStatFinal = '';
    let motivo = '';

    for (let i = 0; i < maxIteracoes; i++) {
      const soap = this.envelope(cUF, cnpj, ultNSU);
      let resp: string;
      try {
        const r = await axios.post(this.url, soap, {
          httpsAgent,
          timeout: 60000,
          headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
          // o SOAP-Fault vem com HTTP 500; deixamos passar pra ler a mensagem
          validateStatus: () => true,
          responseType: 'text',
          transformResponse: [(d) => d],
        });
        resp = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
      } catch (e: any) {
        throw new BadRequestException(`Falha ao falar com o SEFAZ: ${e?.message ?? e}`);
      }

      const cStat = this.get1(/<cStat>(\d+)<\/cStat>/, resp) ?? '';
      motivo = this.get1(/<xMotivo>([^<]*)<\/xMotivo>/, resp) ?? '';
      cStatFinal = cStat;
      const respUlt = this.get1(/<ultNSU>(\d+)<\/ultNSU>/, resp);
      const respMax = this.get1(/<maxNSU>(\d+)<\/maxNSU>/, resp);
      if (respMax) maxNSU = respMax;

      if (cStat === '656') { // consumo indevido — respeitar o intervalo
        motivo = 'Consumo indevido — aguarde ~1h para nova consulta (limite do SEFAZ).';
        break;
      }
      if (cStat && !['137', '138'].includes(cStat)) {
        // 137 = nenhum doc · 138 = documentos localizados · outros = erro (cert, CNPJ sem credenciamento, etc)
        throw new BadRequestException(`SEFAZ recusou (cStat ${cStat}): ${motivo}`);
      }

      // extrai cada docZip (base64+gzip) e ingere
      const zips = resp.match(/<(?:\w+:)?docZip[^>]*>([\s\S]*?)<\/(?:\w+:)?docZip>/g) ?? [];
      for (const bloco of zips) {
        const b64 = this.get1(/>([\s\S]*?)</, bloco);
        if (!b64) continue;
        const xml = this.descompactar(b64);
        if (!xml) { invalidos++; continue; }
        docs++;
        // só documentos completos viram Document (resumos "resNFe" não têm itens → ignorados)
        const r = await this.analise.ingerirXml(companyId, xml, 'sefaz');
        if (r.status === 'novo') novos++;
        else if (r.status === 'duplicado') duplicados++;
        else invalidos++;
      }

      if (respUlt) ultNSU = respUlt;
      // salva progresso a cada lote (retoma daqui se cair)
      await this.prisma.company.update({
        where: { id: companyId },
        data: { sefazUltNSU: ultNSU, sefazMaxNSU: maxNSU, sefazUltConsultaEm: new Date() },
      }).catch(() => undefined);

      if (novos > 0) {
        await this.prisma.company.update({ where: { id: companyId }, data: { sharepointAnalisadoEm: new Date() } }).catch(() => undefined);
      }

      // fim: nenhum doc, ou já chegamos ao fim da fila
      if (cStat === '137') break;
      if (respUlt && respMax && BigInt(respUlt) >= BigInt(respMax)) break;
      await this.pausa(this.PAUSA_MS);
    }

    return {
      cliente: company.name, cnpj, cUF,
      cStat: cStatFinal, motivo,
      ultNSU, maxNSU,
      docsRecebidos: docs, novos, duplicados, invalidos,
      fimDaFila: !!maxNSU && BigInt(ultNSU || '0') >= BigInt(maxNSU || '0'),
    };
  }
}
