import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { LgpdService } from './lgpd.service';

@Controller('lgpd')
export class LgpdController {
  constructor(private readonly service: LgpdService) {}

  @Post('requests')
  create(@Body() body: any, @Req() req: any) {
    return this.service.create({
      ...body,
      ipSolicitante: req.ip || req.headers?.['x-forwarded-for'],
    });
  }

  @Get('requests')
  list(@Query('status') status?: string) {
    return this.service.list(status);
  }

  @Post('requests/:id/execute-export')
  exportData(@Param('id') id: string) {
    return this.service.executeExport(id);
  }

  @Post('requests/:id/execute-delete')
  deleteData(@Param('id') id: string, @Body() body: { legalBasis?: string }) {
    return this.service.executeDelete(id, body.legalBasis);
  }

  @Post('requests/:id/reject')
  reject(@Param('id') id: string, @Body() body: { motivo: string }) {
    return this.service.reject(id, body.motivo);
  }
}
