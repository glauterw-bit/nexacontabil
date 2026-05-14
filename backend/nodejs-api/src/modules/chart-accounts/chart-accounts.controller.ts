import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ChartAccountsService } from './chart-accounts.service';

@Controller('chart-accounts')
export class ChartAccountsController {
  constructor(private readonly service: ChartAccountsService) {}

  @Get()
  list(@Query('companyId') companyId: string, @Query('tipo') tipo?: string) {
    return this.service.list(companyId, tipo);
  }

  @Get('tree')
  tree(@Query('companyId') companyId: string) {
    return this.service.tree(companyId);
  }

  @Post()
  create(@Body() body: any) {
    return this.service.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post('seed-pcasp')
  seed(@Body('companyId') companyId: string) {
    return this.service.seedPCASP(companyId);
  }
}
