import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MotorTributarioService } from './motor-tributario.service';
import { MotorTributarioResolver } from './motor-tributario.resolver';

@Module({
  providers: [MotorTributarioService, MotorTributarioResolver, PrismaService],
  exports: [MotorTributarioService],
})
export class MotorTributarioModule {}
