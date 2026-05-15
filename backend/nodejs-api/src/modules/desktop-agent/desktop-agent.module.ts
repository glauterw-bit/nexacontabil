import { Module } from '@nestjs/common';
import { DesktopAgentController } from './desktop-agent.controller';

@Module({
  controllers: [DesktopAgentController],
})
export class DesktopAgentModule {}
