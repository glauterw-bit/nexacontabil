import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { MonthlyPackageService } from './monthly-package.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('monthly-package')
@UseGuards(JwtAuthGuard)
export class MonthlyPackageController {
  constructor(private readonly service: MonthlyPackageService) {}

  @Get()
  async get(
    @Query('companyId') companyId: string,
    @Query('ano') ano: string,
    @Query('mes') mes: string,
  ) {
    return this.service.generate(companyId, Number(ano), Number(mes));
  }
}
