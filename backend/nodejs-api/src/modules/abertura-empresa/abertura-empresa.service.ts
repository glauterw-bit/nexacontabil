import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AberturaEmpresaService {
  constructor(private prisma: PrismaService) {}

  async listar(escritorioId: string) {
    return this.prisma.companyOpening.findMany({
      where: { escritorioId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async criar(escritorioId: string, data: {
    nomeEmpresarial: string;
    nomeFantasia?: string;
    tipoEmpresa: string;
    objetoSocial: string;
    cnaePrincipal: string;
    cnaesSecundarios?: string;
    capitalSocial?: number;
    socios: string;
    enderecoComercial: string;
    municipio: string;
    uf: string;
    observacoes?: string;
  }) {
    return this.prisma.companyOpening.create({
      data: { escritorioId, ...data },
    });
  }

  async avancarStatus(id: string, novoStatus: string) {
    return this.prisma.companyOpening.update({
      where: { id },
      data: { status: novoStatus },
    });
  }

  async atualizarChecklist(id: string, checklist: {
    contratoSocialGerado?: boolean;
    dbeGerado?: boolean; dbeNumero?: string;
    cnpjEmitido?: boolean; cnpjNumero?: string;
    inscricaoEstadual?: boolean; ieNumero?: string;
    inscricaoMunicipal?: boolean; imNumero?: string;
    alvara?: boolean;
    dtCnpj?: Date; dtInicioAtividades?: Date;
  }) {
    return this.prisma.companyOpening.update({
      where: { id },
      data: checklist,
    });
  }

  async atualizar(id: string, data: any) {
    return this.prisma.companyOpening.update({ where: { id }, data });
  }

  async deletar(id: string) {
    await this.prisma.companyOpening.delete({ where: { id } });
    return { success: true };
  }

  async resumo(escritorioId: string) {
    const todos = await this.prisma.companyOpening.findMany({ where: { escritorioId } });
    return {
      total: todos.length,
      emDocumentacao: todos.filter(a => a.status === 'documentacao').length,
      emProtocolo: todos.filter(a => a.status === 'protocolo').length,
      concluidas: todos.filter(a => a.status === 'concluida').length,
      canceladas: todos.filter(a => a.status === 'cancelada').length,
    };
  }

  async gerarChecklist(tipoEmpresa: string) {
    const base = [
      { item: 'Consulta de viabilidade', concluido: false },
      { item: 'Elaboração do contrato/requerimento', concluido: false },
      { item: 'Registro na Junta Comercial / Cartório', concluido: false },
      { item: 'Inscrição no CNPJ (DREI/DBE)', concluido: false },
      { item: 'Inscrição Estadual (IE)', concluido: false },
      { item: 'Inscrição Municipal (IM/NFSE)', concluido: false },
      { item: 'Alvará de funcionamento', concluido: false },
      { item: 'Abertura de conta bancária PJ', concluido: false },
    ];

    if (tipoEmpresa === 'mei') {
      return [
        { item: 'Cadastro no Portal do Empreendedor (CNPJ automático)', concluido: false },
        { item: 'Inscrição Municipal (para prestadores de serviço)', concluido: false },
        { item: 'Abertura de conta bancária PJ', concluido: false },
      ];
    }

    return base;
  }
}
