import { Module } from '@nestjs/common';
import { MigrationController } from './migration.controller';
import { MigrationService } from './migration.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [MigrationController],
  providers: [MigrationService, PrismaService],
})
export class MigrationModule {}
