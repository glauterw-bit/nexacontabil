import { Module } from '@nestjs/common';
import { MeiService } from './mei.service';
import { MeiResolver } from './mei.resolver';
import { PrismaService } from '../../database/prisma.service';

@Module({
  providers: [MeiService, MeiResolver, PrismaService],
  exports: [MeiService],
})
export class MeiModule {}
