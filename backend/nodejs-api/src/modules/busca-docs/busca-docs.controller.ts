import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BuscaDocsService } from './busca-docs.service';

@Controller('api/v1/busca-docs')
@UseGuards(JwtAuthGuard)
export class BuscaDocsController {
  constructor(private readonly service: BuscaDocsService) {}

  @Post()
  buscar(@Body() body: { query: string }) {
    return this.service.buscar(body?.query ?? '');
  }
}
