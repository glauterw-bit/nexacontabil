import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { TenantMiddleware } from './common/tenant.middleware';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { CompanyAccessGuard } from './common/company-access.guard';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';

import { PrismaService } from './database/prisma.service';
import { AuthModule } from './modules/auth/auth.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { AuditModule } from './modules/audit/audit.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { FiscalNotesModule } from './modules/fiscal-notes/fiscal-notes.module';
import { BoletosModule } from './modules/boletos/boletos.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { ReportsModule } from './modules/reports/reports.module';
import { BankingModule } from './modules/banking/banking.module';
import { SignaturesModule } from './modules/signatures/signatures.module';
import { ExecutiveReportsModule } from './modules/executive-reports/executive-reports.module';
import { MotorTributarioModule } from './modules/motor-tributario/motor-tributario.module';
import { NfeModule } from './modules/nfe/nfe.module';
import { NfseModule } from './modules/nfse/nfse.module';
import { CertificadoDigitalModule } from './modules/certificado-digital/certificado-digital.module';

// Novos módulos v2
import { HonorariosModule } from './modules/honorarios/honorarios.module';
import { CrmClientesModule } from './modules/crm-clientes/crm-clientes.module';
import { TarefasModule } from './modules/tarefas/tarefas.module';
import { MeiModule } from './modules/mei/mei.module';
import { ComunicadosModule } from './modules/comunicados/comunicados.module';
import { AberturaEmpresaModule } from './modules/abertura-empresa/abertura-empresa.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

// Novos módulos
import { EsocialModule } from './modules/esocial/esocial.module';
import { SpedModule } from './modules/sped/sped.module';
import { SimplesNacionalModule } from './modules/simples-nacional/simples-nacional.module';
import { FeriasRescisaoModule } from './modules/ferias-rescisao/ferias-rescisao.module';
import { PatrimonioModule } from './modules/patrimonio/patrimonio.module';
import { XmlCaptureModule } from './modules/xml-capture/xml-capture.module';
import { PortalClienteModule } from './modules/portal-cliente/portal-cliente.module';
import { CertidoesModule } from './modules/certidoes/certidoes.module';
import { PlanejamentoTributarioModule } from './modules/planejamento-tributario/planejamento-tributario.module';
import { AiModule } from './modules/ai/ai.module';

// Novos módulos Nibo-inspired
import { RadarEcacModule } from './modules/radar-ecac/radar-ecac.module';
import { RecalculoGuiasModule } from './modules/recalculo-guias/recalculo-guias.module';
import { CentralCobrancasModule } from './modules/central-cobrancas/central-cobrancas.module';
import { ExportacaoContabilModule } from './modules/exportacao-contabil/exportacao-contabil.module';
import { DashboardEscritorioModule } from './modules/dashboard-escritorio/dashboard-escritorio.module';
import { HealthModule } from './modules/health/health.module';
import { DesktopAgentModule } from './modules/desktop-agent/desktop-agent.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { PeriodClosingModule } from './modules/period-closing/period-closing.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { MonthlyPackageModule } from './modules/monthly-package/monthly-package.module';
import { CopilotModule } from './modules/copilot/copilot.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { EmailModule } from './modules/email/email.module';
import { CloudModule } from './modules/cloud/cloud.module';
import { CbsIbsModule } from './modules/tax-reform/cbs-ibs.module';
import { MigrationModule } from './modules/migration/migration.module';
import { HealthScoreModule } from './modules/health-score/health-score.module';
import { PredictiveModule } from './modules/predictive/predictive.module';
import { BenchmarkModule } from './modules/benchmark/benchmark.module';
import { BalanceSheetModule } from './modules/balance-sheet/balance-sheet.module';
import { OnvioModule } from './modules/onvio/onvio.module';
import { NcmInteligenteModule } from './modules/ncm-inteligente/ncm-inteligente.module';
import { EsteiraFiscalModule } from './modules/esteira-fiscal/esteira-fiscal.module';
import { ChartAccountsModule } from './modules/chart-accounts/chart-accounts.module';
import { CostCentersModule } from './modules/cost-centers/cost-centers.module';
import { FiscalCalendarModule } from './modules/fiscal-calendar/fiscal-calendar.module';
import { FinancialStatementsModule } from './modules/financial-statements/financial-statements.module';
import { LgpdModule } from './modules/lgpd/lgpd.module';
import { TwoFactorModule } from './modules/two-factor/two-factor.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      sortSchema: true,
      playground: process.env.NODE_ENV !== 'production',
      introspection: process.env.NODE_ENV !== 'production',
      context: ({ req }: any) => ({ req }),
    }),

    // Core modules
    AuthModule,
    CompaniesModule,
    DocumentsModule,
    TransactionsModule,
    ReconciliationModule,
    AuditModule,
    PayrollModule,
    FiscalNotesModule,
    BoletosModule,
    CalendarModule,
    ReportsModule,
    BankingModule,
    SignaturesModule,
    ExecutiveReportsModule,

    // Fiscal & Tax
    MotorTributarioModule,
    NfeModule,
    NfseModule,
    CertificadoDigitalModule,
    SimplesNacionalModule,
    PlanejamentoTributarioModule,

    // Obrigações acessórias
    EsocialModule,
    SpedModule,
    CertidoesModule,

    // RH
    FeriasRescisaoModule,

    // Patrimônio
    PatrimonioModule,

    // XML & Portal
    XmlCaptureModule,
    PortalClienteModule,

    // Gestão do escritório
    HonorariosModule,
    CrmClientesModule,
    TarefasModule,
    ComunicadosModule,
    AberturaEmpresaModule,
    NotificationsModule,

    // MEI
    MeiModule,

    // IA (Claude)
    AiModule,

    // Módulos Nibo-inspired
    RadarEcacModule,
    RecalculoGuiasModule,
    CentralCobrancasModule,
    ExportacaoContabilModule,
    DashboardEscritorioModule,

    // Contabil avancado
    ChartAccountsModule,
    CostCentersModule,
    FinancialStatementsModule,

    // Calendario fiscal + Workflow
    FiscalCalendarModule,

    // Seguranca & Compliance
    TwoFactorModule,
    LgpdModule,

    // Operação
    HealthModule,
    DesktopAgentModule,
    IntegrationsModule,
    PeriodClosingModule,
    WhatsappModule,
    MonthlyPackageModule,
    CopilotModule,
    WorkflowModule,
    CloudModule,
    CbsIbsModule,
    MigrationModule,
    HealthScoreModule,
    PredictiveModule,
    BenchmarkModule,
    BalanceSheetModule,
    OnvioModule,
    NcmInteligenteModule,
    EsteiraFiscalModule,
    EmailModule,
  ],
  providers: [
    PrismaService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CompanyAccessGuard },
  ],
  exports: [PrismaService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
