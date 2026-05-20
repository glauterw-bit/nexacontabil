import {
  Controller, Post, Body, UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiService } from './ai.service';

interface ChatBody {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  context?: { cnpj?: string; regime?: string; mes?: string };
}

interface XmlBody {
  xml: string;
}

interface SearchBody {
  query: string;
}

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('chat')
  async chat(@Body() body: ChatBody) {
    if (!body?.message) throw new BadRequestException('message obrigatório');
    const reply = await this.ai.chat(body.message, body.history ?? [], body.context);
    return { reply };
  }

  @Post('ocr')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async ocr(@UploadedFile() file: any) {
    if (!file) throw new BadRequestException('file obrigatório (multipart/form-data field "file")');
    const mt = (file.mimetype || '').toLowerCase();
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(mt)) {
      throw new BadRequestException(`mediaType não suportado: ${mt}. Aceitos: ${allowed.join(', ')}`);
    }
    const base64 = file.buffer.toString('base64');
    return this.ai.processarDocumento(base64, mt as any);
  }

  @Post('xml')
  async xml(@Body() body: XmlBody) {
    if (!body?.xml) throw new BadRequestException('xml obrigatório');
    return this.ai.analisarXmlFiscal(body.xml);
  }

  @Post('search-parser')
  async searchParser(@Body() body: SearchBody) {
    if (!body?.query) throw new BadRequestException('query obrigatório');
    return this.ai.parseDocumentSearch(body.query);
  }
}
