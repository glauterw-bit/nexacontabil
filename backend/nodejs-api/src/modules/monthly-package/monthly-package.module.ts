import { Module } from '@nestjs/common';
import { MonthlyPackageController } from './monthly-package.controller';
import { MonthlyPackageService } from './monthly-package.service';
import { PrismaService } from '../../database/prisma.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [MonthlyPackageController],
  providers: [MonthlyPackageService, PrismaService],
})
export class MonthlyPackageModule {}
