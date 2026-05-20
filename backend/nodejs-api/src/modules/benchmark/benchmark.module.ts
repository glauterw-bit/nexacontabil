import { Module, Controller, Get, Query as QueryParam } from '@nestjs/common';
import { Public } from '../../common/public.decorator';
import { BenchmarkService } from './benchmark.service';
import { PrismaService } from '../../database/prisma.service';
import { ReportsModule } from '../reports/reports.module';

@Controller('benchmark')
class BenchmarkController {
  constructor(private readonly svc: BenchmarkService) {}

  @Get()
  async get(
    @QueryParam('companyId') companyId: string,
    @QueryParam('setor') setor?: string,
  ) {
    return this.svc.compute(companyId, setor);
  }

  @Public()
  @Get('setores')
  setores() {
    return this.svc.listSetores();
  }
}

@Module({
  imports: [ReportsModule],
  controllers: [BenchmarkController],
  providers: [BenchmarkService, PrismaService],
})
export class BenchmarkModule {}
