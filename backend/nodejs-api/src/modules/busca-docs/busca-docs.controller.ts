import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BuscaDocsService } from './busca-docs.service';

@Controller('busca-docs')
@UseGuards(JwtAuthGuard)
export class BuscaDocsController {
  constructor(private readonly service: BuscaDocsService) {}

  @Post()
  buscar(@Body() body: { query: string }) {
    return this.service.buscar(body?.query ?? '');
  }

  @Get('download/:id')
  async download(@Param('id') id: string, @Res() res: Response) {
    const f = await this.service.baixar(id);
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(f.name)}"`);
    res.send(f.buffer);
  }
}
