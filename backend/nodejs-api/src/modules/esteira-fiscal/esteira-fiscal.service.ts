import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { GoogleDriveService } from '../cloud/google-drive.service';
import { AiService } from '../ai/ai.service';
import { EmailService } from '../email/email.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { NcmInteligenteService } from '../ncm-inteligente/ncm-inteligente.service';

interface ArquivoRoteado {
  nome: string;
  fileId: string;
  tipo: 'nfe' | 'pdf' | 'imagem' | 'desconhecido';
  cnpj?: string;
  companyId?: string;
  companyName?: string;
  roteado: boolean;
  inconsistencias: string[];
}

@Injectable()
export class EsteiraFiscalService {
  private readonly logger = new Logger(EsteiraFiscalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly drive: GoogleDriveService,
    private readonly ai: AiService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsappService,
    private readonly ncm: NcmInteligenteService,
  ) {}

  /**
   * Executa a esteira: varre a pasta do Drive, identifica o cliente de cada
   * arquivo pelo CNPJ, valida tributação contra o Banco de NCM, gera um
   * relatório por cliente e envia por e-mail + WhatsApp.
   */
  async executar(userId: string, opts: { connectionId: string; folderId?: string; enviarRelatorios?: boolean }) {
    if (!opts.connectionId) throw new BadRequestException('connectionId obrigatório (conexão Google Drive)');

    const conn = await this.prisma.cloudConnection.findUnique({ where: { id: opts.connectionId } });
    if (!conn) throw new NotFoundException('Conexão Drive não encontrada');

    const execucao = await this.prisma.esteiraExecucao.create({
      data: {
        userId,
        connectionId: opts.connectionId,
        provider: conn.provider,
        folderId: opts.folderId ?? conn.rootFolderId,
        folderName: conn.label,
        status: 'rodando',
      },
    });

    try {
      const files = await this.drive.search(opts.connectionId, { folderId: opts.folderId, pageSize: 100 });
      const roteados: ArquivoRoteado[] = [];

      for (const f of files) {
        if (!f.id || !f.name) continue;
        const r = await this.processarArquivo(opts.connectionId, f.id, f.name, f.mimeType ?? '');
        roteados.push(r);
      }

      // agrupa por empresa
      const porEmpresa = new Map<string, ArquivoRoteado[]>();
      for (const r of roteados) {
        if (r.companyId) {
          if (!porEmpresa.has(r.companyId)) porEmpresa.set(r.companyId, []);
          porEmpresa.get(r.companyId)!.push(r);
        }
      }

      let relatoriosEnviados = 0;
      if (opts.enviarRelatorios !== false) {
        for (const [companyId, docs] of porEmpresa) {
          const enviado = await this.gerarEEnviarRelatorio(companyId, docs, execucao.id);
          if (enviado) relatoriosEnviados++;
        }
      }

      const naoRoteados = roteados.filter(r => !r.roteado).length;
      const comInconsistencia = roteados.filter(r => r.inconsistencias.length > 0).length;

      return this.prisma.esteiraExecucao.update({
        where: { id: execucao.id },
        data: {
          status: naoRoteados > 0 ? 'parcial' : 'concluido',
          totalArquivos: roteados.length,
          roteados: roteados.filter(r => r.roteado).length,
          naoRoteados,
          comInconsistencia,
          relatoriosEnviados,
          itensJson: JSON.stringify(roteados),
          finishedAt: new Date(),
        },
      });
    } catch (err: any) {
      this.logger.error(`Esteira falhou: ${err.message}`);
      await this.prisma.esteiraExecucao.update({
        where: { id: execucao.id },
        data: { status: 'erro', erro: err.message, finishedAt: new Date() },
      });
      throw err;
    }
  }

  /** Identifica o cliente de um arquivo e valida tributação. */
  private async processarArquivo(connectionId: string, fileId: string, nome: string, mimeType: string): Promise<ArquivoRoteado> {
    const base: ArquivoRoteado = { nome, fileId, tipo: 'desconhecido', roteado: false, inconsistencias: [] };

    try {
      const isXml = mimeType.includes('xml') || nome.toLowerCase().endsWith('.xml');
      const isPdf = mimeType.includes('pdf') || nome.toLowerCase().endsWith('.pdf');
      const isImg = mimeType.startsWith('image/');

      // 1. tenta CNPJ pelo nome da pasta/arquivo primeiro (mais barato)
      let cnpj = extrairCnpj(nome);
      let itensNcm: any[] = [];

      if (isXml) {
        base.tipo = 'nfe';
        const { buffer } = await this.drive.downloadFile(connectionId, fileId);
        const xml = buffer.toString('utf8');
        cnpj = cnpj ?? extrairCnpjDoXml(xml);
        itensNcm = extrairItensNcm(xml);
      } else if (isPdf || isImg) {
        base.tipo = isPdf ? 'pdf' : 'imagem';
        if (!cnpj) {
          // OCR via IA só se não achou CNPJ no nome
          const { buffer, mimeType: mt } = await this.drive.downloadFile(connectionId, fileId);
          const media = (isPdf ? 'application/pdf' : mt) as any;
          const extraido = await this.ai.processarDocumento(buffer.toString('base64'), media);
          cnpj = extraido.destinatarioCnpj?.replace(/\D/g, '') || extraido.emitenteCnpj?.replace(/\D/g, '');
        }
      }

      base.cnpj = cnpj ?? undefined;
      if (!cnpj) return base;

      // 2. casa com empresa cadastrada (destinatário OU emitente)
      const company = await this.prisma.company.findFirst({
        where: { cnpj: cnpj.replace(/\D/g, '') },
        select: { id: true, name: true, segmentoFiscal: true, uf: true, cnaeCode: true },
      });
      if (!company) {
        base.inconsistencias.push(`CNPJ ${cnpj} não está cadastrado como cliente`);
        return base;
      }
      base.companyId = company.id;
      base.companyName = company.name;
      base.roteado = true;

      // 3. valida tributação dos itens contra o Banco de NCM
      const segmento = company.segmentoFiscal ?? undefined;
      for (const it of itensNcm) {
        if (!it.ncm) continue;
        const v = await this.ncm.validarTributacao({
          ncm: it.ncm, segmento, uf: company.uf ?? undefined,
          icmsAliquota: it.icms, ipiAliquota: it.ipi, pisAliquota: it.pis, cofinsAliquota: it.cofins, cfop: it.cfop,
        });
        if (!v.regraEncontrada) {
          base.inconsistencias.push(`NCM ${it.ncm} sem regra no Banco de NCM (revisar tributação)`);
        } else if (!v.ok) {
          for (const d of v.divergencias) {
            base.inconsistencias.push(`NCM ${it.ncm}: ${d.campo} esperado ${d.esperado}% mas veio ${d.encontrado}% (${d.severidade})`);
          }
        }
      }
      return base;
    } catch (err: any) {
      base.inconsistencias.push(`Erro ao processar: ${err.message}`);
      return base;
    }
  }

  /** Gera relatório HTML e envia ao cliente por e-mail + WhatsApp. */
  private async gerarEEnviarRelatorio(companyId: string, docs: ArquivoRoteado[], execucaoId: string): Promise<boolean> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return false;

    const totalDocs = docs.length;
    const totalInconsist = docs.reduce((s, d) => s + d.inconsistencias.length, 0);
    const html = montarRelatorioHtml(company.name, docs, totalDocs, totalInconsist);
    const resumoTexto = montarResumoTexto(company.name, totalDocs, totalInconsist, docs);
    let enviou = false;

    // E-mail
    if (company.email) {
      try {
        const r = await this.email.send(
          company.email,
          `📋 Relatório fiscal — ${company.name} (${totalDocs} documentos)`,
          html,
        );
        await this.prisma.relatorioEnvio.create({
          data: {
            companyId, esteiraExecucaoId: execucaoId, canal: 'email', destino: company.email,
            assunto: `Relatório fiscal — ${company.name}`, corpo: html,
            status: r.ok ? 'enviado' : 'falha', providerId: r.id,
          },
        });
        if (r.ok) enviou = true;
      } catch (err: any) {
        await this.prisma.relatorioEnvio.create({
          data: { companyId, esteiraExecucaoId: execucaoId, canal: 'email', destino: company.email, corpo: html, status: 'falha', erro: err.message },
        });
      }
    }

    // WhatsApp
    if (company.whatsappNumber) {
      try {
        await this.whatsapp.sendMessage(company.whatsappNumber, resumoTexto);
        await this.prisma.relatorioEnvio.create({
          data: { companyId, esteiraExecucaoId: execucaoId, canal: 'whatsapp', destino: company.whatsappNumber, corpo: resumoTexto, status: 'enviado' },
        });
        enviou = true;
      } catch (err: any) {
        await this.prisma.relatorioEnvio.create({
          data: { companyId, esteiraExecucaoId: execucaoId, canal: 'whatsapp', destino: company.whatsappNumber, corpo: resumoTexto, status: 'falha', erro: err.message },
        });
      }
    }

    return enviou;
  }

  async listarExecucoes(userId: string) {
    return this.prisma.esteiraExecucao.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async detalheExecucao(id: string) {
    const exec = await this.prisma.esteiraExecucao.findUnique({ where: { id } });
    if (!exec) throw new NotFoundException('Execução não encontrada');
    const envios = await this.prisma.relatorioEnvio.findMany({
      where: { esteiraExecucaoId: id },
      orderBy: { createdAt: 'desc' },
    });
    return { ...exec, itens: exec.itensJson ? JSON.parse(exec.itensJson) : [], envios };
  }
}

// ─── helpers ──────────────────────────────────────────────────────────

function extrairCnpj(texto: string): string | undefined {
  const m = texto.replace(/\D/g, '').match(/\d{14}/);
  return m ? m[0] : undefined;
}

function extrairCnpjDoXml(xml: string): string | undefined {
  // destinatário primeiro (relatório vai pro dono da nota = quem recebe)
  const dest = xml.match(/<dest>[\s\S]*?<CNPJ>(\d{14})<\/CNPJ>/);
  if (dest) return dest[1];
  const emit = xml.match(/<emit>[\s\S]*?<CNPJ>(\d{14})<\/CNPJ>/);
  if (emit) return emit[1];
  const any = xml.match(/<CNPJ>(\d{14})<\/CNPJ>/);
  return any?.[1];
}

function extrairItensNcm(xml: string): Array<{ ncm: string; descricao?: string; cfop?: string; icms?: number; ipi?: number; pis?: number; cofins?: number }> {
  const itens: any[] = [];
  const blocks = xml.match(/<det[\s\S]*?<\/det>/g) ?? [];
  for (const b of blocks) {
    const ncm = pick(b, 'NCM')?.replace(/\D/g, '');
    if (!ncm) continue;
    itens.push({
      ncm, descricao: pick(b, 'xProd'), cfop: pick(b, 'CFOP'),
      icms: num(pick(b, 'pICMS')), ipi: num(pick(b, 'pIPI')),
      pis: num(pick(b, 'pPIS')), cofins: num(pick(b, 'pCOFINS')),
    });
  }
  return itens;
}
function pick(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m?.[1]?.trim();
}
function num(s?: string): number | undefined { if (s == null) return undefined; const n = parseFloat(s.replace(',', '.')); return isNaN(n) ? undefined : n; }

function montarResumoTexto(nome: string, totalDocs: number, totalInconsist: number, docs: ArquivoRoteado[]): string {
  const linhas = [
    `*Relatório Fiscal — ${nome}*`,
    ``,
    `📄 Documentos processados: ${totalDocs}`,
    totalInconsist > 0
      ? `⚠️ Inconsistências detectadas: ${totalInconsist}`
      : `✅ Nenhuma inconsistência fiscal detectada`,
  ];
  if (totalInconsist > 0) {
    linhas.push('', '*Principais pontos:*');
    const top = docs.flatMap(d => d.inconsistencias).slice(0, 5);
    for (const i of top) linhas.push(`• ${i}`);
  }
  linhas.push('', '_Enviado automaticamente pelo NexaContábil._');
  return linhas.join('\n');
}

function montarRelatorioHtml(nome: string, docs: ArquivoRoteado[], totalDocs: number, totalInconsist: number): string {
  const rows = docs.map(d => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(d.nome)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-transform:uppercase;font-size:11px;color:#666">${d.tipo}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${d.inconsistencias.length === 0
        ? '<span style="color:#16a34a">✓ OK</span>'
        : `<span style="color:#dc2626">⚠ ${d.inconsistencias.length}</span>`}</td>
    </tr>
    ${d.inconsistencias.length ? `<tr><td colspan="3" style="padding:4px 8px 12px 20px;font-size:12px;color:#b45309">${d.inconsistencias.map(escapeHtml).join('<br>')}</td></tr>` : ''}
  `).join('');

  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f2937">
    <div style="background:#4f46e5;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
      <h2 style="margin:0">Relatório Fiscal</h2>
      <p style="margin:4px 0 0;opacity:.9">${escapeHtml(nome)}</p>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:0;padding:24px;border-radius:0 0 8px 8px">
      <div style="display:flex;gap:16px;margin-bottom:20px">
        <div style="flex:1;background:#f9fafb;padding:12px;border-radius:6px;text-align:center">
          <div style="font-size:24px;font-weight:700">${totalDocs}</div>
          <div style="font-size:12px;color:#6b7280">Documentos</div>
        </div>
        <div style="flex:1;background:${totalInconsist > 0 ? '#fef2f2' : '#f0fdf4'};padding:12px;border-radius:6px;text-align:center">
          <div style="font-size:24px;font-weight:700;color:${totalInconsist > 0 ? '#dc2626' : '#16a34a'}">${totalInconsist}</div>
          <div style="font-size:12px;color:#6b7280">Inconsistências</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr style="text-align:left;color:#6b7280;font-size:12px">
          <th style="padding:8px">Documento</th><th style="padding:8px">Tipo</th><th style="padding:8px">Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:12px;color:#9ca3af;margin-top:24px">Relatório gerado automaticamente pela esteira fiscal do NexaContábil. Em caso de dúvidas, responda este e-mail.</p>
    </div>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return (s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
