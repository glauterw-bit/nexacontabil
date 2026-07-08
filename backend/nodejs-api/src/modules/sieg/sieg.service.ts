import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as zlib from 'zlib';
import { PrismaService } from '../../database/prisma.service';
import { AnaliseClienteService } from '../analise-cliente/analise-cliente.service';

/**
 * Integração com o SIEG (buscador de XMLs). O SIEG captura no SEFAZ com o certificado
 * do cliente (ou procuração e-CAC) e guarda no "cofre". Aqui a gente PUXA por API
 * (BaixarXmls), decodifica e joga no mesmo pipeline dos XMLs do drive (parse +
 * validação fiscal + Document, com dedup pela chave de acesso).
 *
 * Doc: https://api.sieg.com/BaixarXmls?api_key=KEY  (POST, body JSON)
 * Limite do SIEG: 30 requisições/min. Take máx 50 por página.
 */
@Injectable()
export class SiegService {
  private readonly logger = new Logger('SIEG');
  private readonly baseUrl = 'https://api.sieg.com';
  private readonly TAKE = 50;
  private readonly PAUSA_MS = 2200; // ~27 req/min, abaixo do teto de 30/min

  // XmlType do SIEG: 1=NFe · 2=CTe · 3=NFSe · 4=NFCe
  private readonly TIPOS: { xmlType: number; nome: string; papel: 'dest' | 'tom' }[] = [
    { xmlType: 1, nome: 'NFe', papel: 'dest' },
    { xmlType: 4, nome: 'NFCe', papel: 'dest' },
    { xmlType: 2, nome: 'CTe', papel: 'tom' },
    { xmlType: 3, nome: 'NFSe', papel: 'dest' },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly analise: AnaliseClienteService,
  ) {}

  private get apiKey(): string {
    return process.env.SIEG_API_KEY ?? '';
  }

  status() {
    return {
      provider: 'sieg',
      configurado: !!this.apiKey,
      limiteReqMin: 30,
      takePorPagina: this.TAKE,
      tipos: this.TIPOS.map((t) => t.nome),
      observacao: this.apiKey
        ? 'Chave SIEG configurada. A busca puxa os XMLs do cofre e ingere no pipeline (dedup pela chave).'
        : 'Defina a variável de ambiente SIEG_API_KEY (gerada em Minha Conta » Integrações API SIEG).',
    };
  }

  private pausa(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Uma página do BaixarXmls. Retorna array de XML (string) ou lança erro claro. */
  private async baixarPagina(body: Record<string, unknown>): Promise<string[]> {
    const resp = await fetch(`${this.baseUrl}/BaixarXmls?api_key=${encodeURIComponent(this.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const texto = await resp.text();
    let data: any;
    try { data = JSON.parse(texto); } catch { data = texto; }

    // Sucesso = array de base64. Erro = objeto/string com mensagem.
    if (Array.isArray(data)) {
      return data.map((b64: string) => this.decodificar(b64)).filter((x): x is string => !!x);
    }
    // SIEG devolve mensagens tipo "Nenhum arquivo XML encontrado..." quando não há nada
    const msg = typeof data === 'string' ? data : (data?.Message ?? data?.message ?? JSON.stringify(data));
    if (/nenhum/i.test(String(msg))) return []; // sem XMLs nesse filtro — não é erro
    throw new BadRequestException(`SIEG: ${msg}`);
  }

  /** base64 → XML string (trata gzip, que o SIEG às vezes usa). */
  private decodificar(b64: string): string | null {
    try {
      const buf = Buffer.from(b64, 'base64');
      if (buf[0] === 0x1f && buf[1] === 0x8b) return zlib.gunzipSync(buf).toString('utf8'); // gzip
      return buf.toString('utf8');
    } catch { return null; }
  }

  /** Busca todos os XMLs de UM cliente no período e ingere. */
  async buscarCliente(companyId: string, opts: { dataInicio?: string; dataFim?: string } = {}) {
    if (!this.apiKey) throw new BadRequestException('SIEG não configurado (falta SIEG_API_KEY).');
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, cnpj: true } });
    if (!company) throw new BadRequestException('Cliente não encontrado.');
    const cnpj = (company.cnpj ?? '').replace(/\D/g, '');
    if (!cnpj || cnpj.startsWith('7')) {
      throw new BadRequestException('Cliente sem CNPJ real (provisório começa com 7) — o SIEG busca pelo CNPJ.');
    }

    const now = new Date();
    const ini = opts.dataInicio ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const fim = opts.dataFim ?? now.toISOString();

    let novos = 0, duplicados = 0, invalidos = 0, inconsistencias = 0, baixados = 0;
    const porTipo: Record<string, number> = {};

    for (const tipo of this.TIPOS) {
      let skip = 0;
      for (let pagina = 0; pagina < 200; pagina++) { // teto de segurança
        const body: Record<string, unknown> = {
          XmlType: tipo.xmlType,
          Take: this.TAKE,
          Skip: skip,
          DataEmissaoInicio: ini,
          DataEmissaoFim: fim,
          Downloadevent: false,
          ...(tipo.papel === 'tom' ? { CnpjTom: cnpj } : { CnpjDest: cnpj }),
        };
        let xmls: string[];
        try {
          xmls = await this.baixarPagina(body);
        } catch (e: any) {
          this.logger.warn(`SIEG ${tipo.nome} ${company.name}: ${e?.message ?? e}`);
          break; // erro nesse tipo — passa pro próximo
        }
        if (!xmls.length) break;
        baixados += xmls.length;
        for (const xml of xmls) {
          const r = await this.analise.ingerirXml(companyId, xml, 'sieg');
          if (r.status === 'novo') { novos++; inconsistencias += r.inconsistencias ?? 0; porTipo[tipo.nome] = (porTipo[tipo.nome] ?? 0) + 1; }
          else if (r.status === 'duplicado') duplicados++;
          else invalidos++;
        }
        if (xmls.length < this.TAKE) break; // última página
        skip += this.TAKE;
        await this.pausa(this.PAUSA_MS); // respeita rate limit
      }
      await this.pausa(this.PAUSA_MS);
    }

    // marca leitura (aparece no frescor do drive / cobertura de sync)
    if (baixados > 0 || novos > 0) {
      await this.prisma.company.update({ where: { id: companyId }, data: { sharepointAnalisadoEm: new Date() } }).catch(() => undefined);
    }

    return { cliente: company.name, cnpj, periodo: { de: ini, ate: fim }, baixados, novos, duplicados, invalidos, inconsistencias, porTipo };
  }

  /**
   * Busca em LOTE — clientes com CNPJ real, os que estão há mais tempo sem leitura
   * primeiro. Limitado por `limite` clientes/chamada por causa do rate limit do SIEG.
   */
  async buscarCarteira(opts: { limite?: number; dataInicio?: string; dataFim?: string } = {}) {
    if (!this.apiKey) throw new BadRequestException('SIEG não configurado (falta SIEG_API_KEY).');
    const limite = Math.min(Math.max(opts.limite ?? 10, 1), 30);
    const clientes = await this.prisma.company.findMany({
      where: { active: true },
      select: { id: true, cnpj: true, sharepointAnalisadoEm: true },
      orderBy: { sharepointAnalisadoEm: 'asc' },
    });
    const elegiveis = clientes.filter((c) => { const n = (c.cnpj ?? '').replace(/\D/g, ''); return n && !n.startsWith('7'); }).slice(0, limite);

    let novosTotal = 0, processados = 0;
    const detalhe: any[] = [];
    for (const c of elegiveis) {
      try {
        const r = await this.buscarCliente(c.id, { dataInicio: opts.dataInicio, dataFim: opts.dataFim });
        novosTotal += r.novos; processados++;
        detalhe.push({ cliente: r.cliente, novos: r.novos, baixados: r.baixados });
      } catch (e: any) {
        detalhe.push({ companyId: c.id, erro: e?.message ?? 'erro' });
      }
    }
    return {
      processados, deUmTotalElegivel: elegiveis.length,
      semCnpjReal: clientes.length - clientes.filter((c) => { const n = (c.cnpj ?? '').replace(/\D/g, ''); return n && !n.startsWith('7'); }).length,
      novosTotal, detalhe,
    };
  }
}
