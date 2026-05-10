import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { DocumentsService } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  /**
   * Chamado pelo Python AI após processar um documento (upload ou WhatsApp).
   * Persiste o resultado no PostgreSQL para alimentar o dashboard.
   */
  @Post('ingest')
  @HttpCode(201)
  async ingest(@Body() body: { company_id: string; result: any; source?: string }) {
    return this.documentsService.saveProcessingResult(body.company_id, body.result, body.source);
  }
}
