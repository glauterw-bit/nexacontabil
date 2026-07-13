import { Module, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../../common/public.decorator';
import { PrismaService } from '../../database/prisma.service';
import { VerificacaoFinalService } from './verificacao-final.service';
import { AnaliseClienteModule } from '../analise-cliente/analise-cliente.module';
import { NcmInteligenteModule } from '../ncm-inteligente/ncm-inteligente.module';

@Controller('verificacao-final')
@UseGuards(JwtAuthGuard)
class VerificacaoFinalController {
  constructor(private readonly service: VerificacaoFinalService) {}

  /** Relatório completo por cliente: docs carregados + obrigações entregues/faltantes. */
  @Get()
  relatorio(@Query('ano') ano?: string) {
    return this.service.relatorio(ano ? parseInt(ano, 10) : undefined);
  }

  /** Contadores PÚBLICOS (sem nomes) — acompanhar a conclusão de fora. */
  @Public()
  @Get('resumo')
  resumo(@Query('ano') ano?: string) {
    return this.service.resumoPublico(ano ? parseInt(ano, 10) : undefined);
  }

  /** Dispara a análise garantidora (aprender NCM → revalidar acervo → auditoria). */
  @Post('analise')
  analise() {
    return this.service.analiseFinal();
  }
}

@Module({
  imports: [AnaliseClienteModule, NcmInteligenteModule],
  controllers: [VerificacaoFinalController],
  providers: [VerificacaoFinalService, PrismaService],
  exports: [VerificacaoFinalService],
})
export class VerificacaoFinalModule {}
