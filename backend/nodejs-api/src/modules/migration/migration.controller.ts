import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { MigrationService } from './migration.service';

@Controller('migration')
export class MigrationController {
  constructor(private readonly service: MigrationService) {}

  @Post('import-csv')
  async importCsv(@Body() body: { csv: string; dryRun?: boolean }) {
    if (!body?.csv) throw new BadRequestException('Campo csv obrigatório');
    return this.service.importCompanies(body.csv, { dryRun: body.dryRun });
  }

  @Post('import-dominio')
  async importDominio(@Body() body: { content: string }) {
    if (!body?.content) throw new BadRequestException('Campo content obrigatório');
    return this.service.importDominio(body.content);
  }

  @Post('preview-csv')
  async previewCsv(@Body() body: { csv: string }) {
    const rows = this.service.parseCsv(body.csv);
    return { total: rows.length, sample: rows.slice(0, 10) };
  }
}
