import { Module, Controller, Get, Query } from '@nestjs/common';
import { PredictiveService } from './predictive.service';
import { PrismaService } from '../../database/prisma.service';
import { AiModule } from '../ai/ai.module';

@Controller('predictive')
class PredictiveController {
  constructor(private readonly service: PredictiveService) {}

  @Get('malha-fina')
  predictMalha(@Query('companyId') companyId: string) {
    return this.service.predictMalhaFina(companyId);
  }

  @Get('folha-anomalies')
  detectFolha(@Query('companyId') companyId: string, @Query('refMonth') refMonth?: string) {
    return this.service.detectFolhaAnomalies(companyId, refMonth);
  }
}

@Module({
  imports: [AiModule],
  controllers: [PredictiveController],
  providers: [PredictiveService, PrismaService],
  exports: [PredictiveService],
})
export class PredictiveModule {}
