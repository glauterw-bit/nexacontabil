import { Injectable, OnModuleInit, OnModuleDestroy, ForbiddenException } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { getTenantContext } from './tenant-context';

/**
 * Models que tem coluna companyId — sao filtrados automaticamente por tenant.
 * Adicione ao Set quando criar novos models multi-tenant.
 */
const COMPANY_SCOPED_MODELS = new Set([
  'Document', 'Transaction', 'AuditTrail', 'ReconciliationRun',
  'Employee', 'Payslip', 'Ferias', 'Rescisao',
  'FiscalNote', 'NfseEmission', 'Boleto',
  'FiscalObligation', 'AcessoryObligation',
  'BankConnection', 'BankStatement',
  'SignatureRequest', 'ExecutiveReport',
  'EsocialEvent', 'SpedFile', 'SimplesApuracao',
  'AtivoImobilizado', 'Depreciation',
  'XmlCapture', 'ClientPortal', 'PortalMessage',
  'TaxSimulation', 'Certidao', 'CertidaoRequest',
  'CertificadoDigital', 'CompanyOpening',
  'Honorario', 'CrmCliente', 'Tarefa', 'MeiApuracao',
  'Comunicado', 'RadarEcacConsulta',
  'CobrancaRegra', 'CobrancaLembrete', 'Notification',
  'ChartAccount', 'CostCenter',
  'FiscalCalendarItem', 'CashFlowStatement', 'EquityMutationStatement',
  'ClientAssignment', 'WorkflowTask',
  'AccountingPeriodClosing',
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Limita pool de conexões pra evitar P2037 em Postgres com slots restritos
    // (Railway free/starter tier permite ~22 connections — múltiplos deploys
    // simultâneos durante o swap estouravam o limite e crashavam o boot).
    const dbUrl = process.env.DATABASE_URL;
    const limit = process.env.PRISMA_CONNECTION_LIMIT ?? '5';
    const datasourceUrl = dbUrl && !dbUrl.includes('connection_limit=')
      ? `${dbUrl}${dbUrl.includes('?') ? '&' : '?'}connection_limit=${limit}`
      : dbUrl;

    super({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      ...(datasourceUrl ? { datasourceUrl } : {}),
    });

    // Middleware multi-tenant: para user role 'cliente', filtra automaticamente
    // queries de findMany/findFirst/findUnique por companyId. Bloqueia
    // create/update se tentar afetar empresa de outro cliente.
    this.$use(async (params: Prisma.MiddlewareParams, next) => {
      const ctx = getTenantContext();
      // Sem contexto (boot/seed) ou bypass explicito: nao filtra
      if (!ctx || ctx.bypassRls) return next(params);
      // Roles privilegiadas veem tudo
      if (ctx.role && ['owner', 'admin', 'contador', 'assistente', 'user'].includes(ctx.role)) {
        return next(params);
      }
      // Role 'cliente' precisa estar restrito a sua propria empresa
      if (ctx.role === 'cliente' && COMPANY_SCOPED_MODELS.has(params.model ?? '')) {
        const tenantCompanyId = ctx.companyId;
        if (!tenantCompanyId) {
          throw new ForbiddenException('Cliente sem companyId vinculado');
        }
        // Aplica filtro implícito
        if (['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy'].includes(params.action)) {
          params.args = params.args ?? {};
          params.args.where = {
            ...(params.args.where ?? {}),
            companyId: tenantCompanyId,
          };
        }
        // Bloqueia gravacao para outra empresa
        if (['create', 'update', 'upsert', 'delete'].includes(params.action)) {
          const data = params.args?.data;
          if (data?.companyId && data.companyId !== tenantCompanyId) {
            throw new ForbiddenException('Cliente não pode operar em outra empresa');
          }
          if (params.args?.where?.companyId && params.args.where.companyId !== tenantCompanyId) {
            throw new ForbiddenException('Cliente não pode operar em outra empresa');
          }
        }
      }
      return next(params);
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
