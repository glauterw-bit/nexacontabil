import { Module } from '@nestjs/common';
import { RadarEcacService } from './radar-ecac.service';
import { RadarEcacController } from './radar-ecac.controller';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [RadarEcacController],
  providers: [RadarEcacService, PrismaService],
  exports: [RadarEcacService],
})
export class RadarEcacModule {}
