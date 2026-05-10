import { Module } from '@nestjs/common';
import { CrmClientesService } from './crm-clientes.service';
import { CrmClientesResolver } from './crm-clientes.resolver';
import { PrismaService } from '../../database/prisma.service';

@Module({
  providers: [CrmClientesService, CrmClientesResolver, PrismaService],
  exports: [CrmClientesService],
})
export class CrmClientesModule {}
