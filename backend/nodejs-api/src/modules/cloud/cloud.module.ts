import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CloudController } from './cloud.controller';
import { GoogleDriveService } from './google-drive.service';
import { OneDriveService } from './onedrive.service';
import { CloudSearchService } from './cloud-search.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [CloudController],
  providers: [PrismaService, GoogleDriveService, OneDriveService, CloudSearchService],
  exports: [GoogleDriveService, OneDriveService, CloudSearchService],
})
export class CloudModule {}
