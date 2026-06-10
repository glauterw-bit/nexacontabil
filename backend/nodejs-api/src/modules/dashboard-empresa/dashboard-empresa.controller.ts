import { Controller, Get, Query } from '@nestjs/common';
import { DashboardEmpresaService } from './dashboard-empresa.service';

@Controller('dashboard-empresa')
export class DashboardEmpresaController {
  constructor(private readonly svc: DashboardEmpresaService) {}

  /** Dashboard da empresa: cronograma, pendências, documentos e análises da IA. */
  @Get()
  overview(@Query('companyId') companyId: string) {
    return this.svc.overview(companyId);
  }
}
