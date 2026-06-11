import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkflowService } from './workflow.service';

@Controller('workflow')
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(private readonly service: WorkflowService) {}

  @Get('stages')
  stages() {
    return this.service.getStages();
  }

  // ─── Atribuições ─────────────────────────────────────────
  @Post('assignments')
  assign(@Req() req: any, @Body() body: { companyId: string; analystId: string; motivo?: string }) {
    return this.service.assignCompany(body.companyId, body.analystId, req.user.id, body.motivo);
  }

  @Post('assignments/bulk-reassign')
  bulkReassign(@Req() req: any, @Body() body: { fromAnalystId: string; toAnalystId: string; motivo: string }) {
    return this.service.bulkReassign(body.fromAnalystId, body.toAnalystId, req.user.id, body.motivo);
  }

  @Get('tasks/:id/verify-chain')
  verifyChain(@Param('id') id: string) {
    return this.service.verifyCommentChain(id);
  }

  @Post('tasks/:id/comments/with-attachment')
  addCommentWithAttachment(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { text: string; attachmentUrl?: string; attachmentName?: string },
  ) {
    return this.service.addComment(id, req.user.id, req.user.name, body.text, body.attachmentUrl, body.attachmentName);
  }

  @Post('tasks/sla-alerts')
  slaAlerts() {
    return this.service.checkSlaAlerts();
  }

  @Get('assignments')
  listAssignments(@Query('analystId') analystId?: string, @Query('active') active?: string) {
    return this.service.listAssignments({
      analystId,
      active: active === undefined ? undefined : active === 'true',
    });
  }

  @Get('carteira')
  myCarteira(@Req() req: any, @Query('analystId') analystId?: string) {
    return this.service.getCarteira(analystId ?? req.user.id);
  }

  // ─── Tasks ───────────────────────────────────────────────
  @Get('kanban')
  kanban(@Req() req: any, @Query('competencia') competencia?: string, @Query('analystId') analystId?: string, @Query('stage') stage?: string, @Query('responsavel') responsavel?: string) {
    const resp = req?.user?.role === 'analista' ? req.user.name : responsavel;
    return this.service.listKanban({ competencia, analystId, stage, responsavel: resp });
  }

  @Post('tasks/ensure')
  ensure(@Body() body: { companyId: string; competencia: string }) {
    return this.service.ensureTasksForMonth(body.companyId, body.competencia);
  }

  @Post('tasks/generate-month')
  generateMonth(@Body() body: { competencia: string }) {
    return this.service.generateMonthForAllCompanies(body.competencia);
  }

  @Post('tasks/:id/start')
  start(@Param('id') id: string, @Req() req: any) {
    return this.service.startTask(id, req.user.id);
  }

  @Post('tasks/:id/complete')
  complete(@Param('id') id: string, @Req() req: any) {
    return this.service.completeTask(id, req.user.id, req.user.name);
  }

  @Post('tasks/:id/block')
  block(@Param('id') id: string, @Req() req: any, @Body() body: { motivo: string }) {
    return this.service.blockTask(id, body.motivo, req.user.id);
  }

  @Post('tasks/:id/assign')
  assignTask(@Param('id') id: string, @Body() body: { analystId: string }) {
    return this.service.assignTask(id, body.analystId);
  }

  @Get('tasks/:id/comments')
  getComments(@Param('id') id: string) {
    return this.service.getComments(id);
  }

  @Post('tasks/:id/comments')
  addComment(@Param('id') id: string, @Req() req: any, @Body() body: { text: string }) {
    return this.service.addComment(id, req.user.id, req.user.name, body.text);
  }

  // ─── Dashboard ──────────────────────────────────────────
  @Get('kpis')
  kpis(@Query('competencia') competencia?: string, @Query('analystId') analystId?: string) {
    return this.service.getKPIs({ competencia, analystId });
  }

  @Get('producao-por-analista')
  producao(@Query('competencia') competencia?: string) {
    return this.service.getProducaoPorAnalista(competencia);
  }
}
