import { Controller, Get, Query, Module } from '@nestjs/common';
import { HealthScoreService } from './health-score.service';
import { PrismaService } from '../../database/prisma.service';

@Controller('health-score')
class HealthScoreController {
  constructor(private readonly service: HealthScoreService) {}
  @Get()
  get(@Query('companyId') companyId: string) {
    return this.service.compute(companyId);
  }
}

@Module({
  controllers: [HealthScoreController],
  providers: [HealthScoreService, PrismaService],
  exports: [HealthScoreService],
})
export class HealthScoreModule {}
