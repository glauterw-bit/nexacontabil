import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SignaturesService } from './signatures.service';
import { SignaturesResolver } from './signatures.resolver';

@Module({
  providers: [SignaturesService, SignaturesResolver, PrismaService],
  exports: [SignaturesService],
})
export class SignaturesModule {}
