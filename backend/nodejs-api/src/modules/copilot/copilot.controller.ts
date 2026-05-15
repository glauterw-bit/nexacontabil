import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CopilotService } from './copilot.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('copilot')
@UseGuards(JwtAuthGuard)
export class CopilotController {
  constructor(private readonly service: CopilotService) {}

  @Post('chat')
  async chat(@Body() body: {
    companyId?: string | null;
    question: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) {
    return this.service.chatWithContext(body.companyId ?? null, body.question, body.history ?? []);
  }
}
