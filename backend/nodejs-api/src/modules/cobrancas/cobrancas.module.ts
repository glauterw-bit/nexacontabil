import { Module, Controller, Get, Post, Patch, Query, Param, Body, Req, UseGuards, Injectable } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CobrancasService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(data: any, criadoPor?: string) {
    if (!data?.responsavel || !data?.titulo) throw new Error('responsavel e titulo obrigatórios');
    return this.prisma.cobranca.create({
      data: {
        responsavel: data.responsavel, titulo: data.titulo, criadoPor,
        companyId: data.companyId ?? null, tipo: data.tipo === 'obrigacao' ? 'obrigacao' : 'atividade',
        descricao: data.descricao ?? null, obrigacaoTipo: data.obrigacaoTipo ?? null,
        competencia: data.competencia ?? null, prazo: data.prazo ? new Date(data.prazo) : null,
        prioridade: data.prioridade ?? 'normal', status: 'aberta',
      },
    });
  }

  /** Lista cobranças (do analista logado se role=analista; senão por filtro). */
  async listar(user: any, responsavel?: string, status?: string) {
    const resp = user?.role === 'analista' ? user.name : responsavel;
    const where: any = {};
    if (resp) where.responsavel = resp;
    if (status) where.status = status;
    const itens = await this.prisma.cobranca.findMany({ where, orderBy: [{ status: 'asc' }, { prazo: 'asc' }, { createdAt: 'desc' }] });
    // enriquece com nome do cliente
    const ids = [...new Set(itens.map((i) => i.companyId).filter(Boolean))] as string[];
    const cos = ids.length ? await this.prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const nome = new Map(cos.map((c) => [c.id, c.name]));
    return itens.map((i) => ({ ...i, cliente: i.companyId ? nome.get(i.companyId) ?? null : null }));
  }

  async status(responsavel?: string) {
    const where: any = responsavel ? { responsavel } : {};
    const [abertas, andamento, concluidas] = await Promise.all([
      this.prisma.cobranca.count({ where: { ...where, status: 'aberta' } }),
      this.prisma.cobranca.count({ where: { ...where, status: 'em_andamento' } }),
      this.prisma.cobranca.count({ where: { ...where, status: 'concluida' } }),
    ]);
    return { abertas, andamento, concluidas };
  }

  async atualizar(id: string, patch: any) {
    const data: any = {};
    if (patch.status) { data.status = patch.status; if (patch.status === 'concluida') data.concluidaEm = new Date(); }
    if (patch.prioridade) data.prioridade = patch.prioridade;
    return this.prisma.cobranca.update({ where: { id }, data });
  }
}

@Controller('cobrancas')
@UseGuards(JwtAuthGuard)
class CobrancasController {
  constructor(private readonly service: CobrancasService) {}
  @Post()
  criar(@Req() req: any, @Body() body: any) { return this.service.criar(body, req.user?.name); }
  @Get()
  listar(@Req() req: any, @Query('responsavel') responsavel?: string, @Query('status') status?: string) { return this.service.listar(req.user, responsavel, status); }
  @Get('status')
  status(@Query('responsavel') responsavel?: string) { return this.service.status(responsavel); }
  @Patch(':id')
  atualizar(@Param('id') id: string, @Body() body: any) { return this.service.atualizar(id, body); }
}

@Module({
  controllers: [CobrancasController],
  providers: [CobrancasService, PrismaService],
  exports: [CobrancasService],
})
export class CobrancasModule {}
