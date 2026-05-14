import { Module } from '@nestjs/common';
import { CostCentersController } from './cost-centers.controller';
import { CostCentersService } from './cost-centers.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [CostCentersController],
  providers: [CostCentersService, PrismaService],
})
export class CostCentersModule {}
