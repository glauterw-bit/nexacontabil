import { Module, Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SolicitacoesService } from './solicitacoes.service';
import { PrismaService } from '../../database/prisma.service';

@Controller('solicitacoes')
@UseGuards(JwtAuthGuard)
class SolicitacoesController {
  constructor(private readonly service: SolicitacoesService) {}
  @Get('overview')
  overview() { return this.service.overview(); }
  @Get('mensagem/:companyId')
  mensagem(@Param('companyId') companyId: string) { return this.service.mensagem(companyId); }
}

@Module({
  controllers: [SolicitacoesController],
  providers: [SolicitacoesService, PrismaService],
  exports: [SolicitacoesService],
})
export class SolicitacoesModule {}
