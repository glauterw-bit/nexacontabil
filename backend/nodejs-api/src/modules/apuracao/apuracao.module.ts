import { Module, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApuracaoService } from './apuracao.service';
import { PrismaService } from '../../database/prisma.service';

@Controller('apuracao')
@UseGuards(JwtAuthGuard)
class ApuracaoController {
  constructor(private readonly service: ApuracaoService) {}
  @Get('overview')
  overview() { return this.service.overview(); }
  @Get('cliente/:companyId')
  cliente(@Param('companyId') companyId: string) { return this.service.cliente(companyId); }
}

@Module({
  controllers: [ApuracaoController],
  providers: [ApuracaoService, PrismaService],
  exports: [ApuracaoService],
})
export class ApuracaoModule {}
