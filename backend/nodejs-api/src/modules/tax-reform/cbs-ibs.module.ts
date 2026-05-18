import { Module } from '@nestjs/common';
import { CbsIbsController } from './cbs-ibs.controller';
import { CbsIbsService } from './cbs-ibs.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [CbsIbsController],
  providers: [CbsIbsService, PrismaService],
  exports: [CbsIbsService],
})
export class CbsIbsModule {}
