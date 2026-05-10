import { Module } from '@nestjs/common';
import { PortalClienteService } from './portal-cliente.service';
import { PortalClienteResolver } from './portal-cliente.resolver';
import { PrismaService } from '../../database/prisma.service';

@Module({
  providers: [PortalClienteService, PortalClienteResolver, PrismaService],
  exports: [PortalClienteService],
})
export class PortalClienteModule {}
