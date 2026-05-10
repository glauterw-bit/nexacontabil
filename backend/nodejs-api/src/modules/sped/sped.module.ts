import { Module } from '@nestjs/common';
import { SpedService } from './sped.service';
import { SpedResolver } from './sped.resolver';
import { PrismaService } from '../../database/prisma.service';

@Module({
  providers: [SpedService, SpedResolver, PrismaService],
  exports: [SpedService],
})
export class SpedModule {}
