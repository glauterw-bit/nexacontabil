import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CompaniesService } from './companies.service';
import { CompaniesResolver } from './companies.resolver';

@Module({
  providers: [CompaniesService, CompaniesResolver, PrismaService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
