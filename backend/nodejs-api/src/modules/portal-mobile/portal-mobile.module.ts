import { Module } from '@nestjs/common';
import { PortalMobileService } from './portal-mobile.service';
import { PortalMobileController } from './portal-mobile.controller';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [PortalMobileController],
  providers: [PortalMobileService, PrismaService],
  exports: [PortalMobileService],
})
export class PortalMobileModule {}
