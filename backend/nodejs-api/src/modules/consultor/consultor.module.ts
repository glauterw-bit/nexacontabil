import { Module, Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../database/prisma.service';
import { ConsultorService } from './consultor.service';
import { BuscaDocsModule } from '../busca-docs/busca-docs.module';
import { AiModule } from '../ai/ai.module';

@Controller('consultor')
@UseGuards(JwtAuthGuard)
class ConsultorController {
  constructor(private readonly service: ConsultorService) {}

  /** Pergunta em linguagem natural → encontra os documentos + entrega a análise. */
  @Post('perguntar')
  perguntar(@Body() body: { pergunta: string; historico?: Array<{ role: 'user' | 'assistant'; content: string }> }) {
    return this.service.perguntar(body?.pergunta, body?.historico ?? []);
  }
}

@Module({
  imports: [BuscaDocsModule, AiModule],
  controllers: [ConsultorController],
  providers: [ConsultorService, PrismaService],
  exports: [ConsultorService],
})
export class ConsultorModule {}
