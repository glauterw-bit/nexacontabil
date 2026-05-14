import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CostCentersService } from './cost-centers.service';

@Controller('cost-centers')
export class CostCentersController {
  constructor(private readonly service: CostCentersService) {}

  @Get() list(@Query('companyId') companyId: string) { return this.service.list(companyId); }
  @Post() create(@Body() body: any) { return this.service.create(body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: any) { return this.service.update(id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}
