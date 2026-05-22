import { Module } from '@nestjs/common';
import { OnvioService } from './onvio.service';
import { OnvioController } from './onvio.controller';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [OnvioController],
  providers: [OnvioService, PrismaService],
  exports: [OnvioService],
})
export class OnvioModule {}
