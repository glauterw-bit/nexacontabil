import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsResolver } from './notifications.resolver';
import { PrismaService } from '../../database/prisma.service';

@Module({
  providers: [NotificationsService, NotificationsResolver, PrismaService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
