import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [WorkflowController],
  providers: [WorkflowService, PrismaService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
