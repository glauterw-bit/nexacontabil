import { Module, Controller, Get, Query as QueryParam } from '@nestjs/common';
import { BalanceSheetService } from './balance-sheet.service';
import { PrismaService } from '../../database/prisma.service';

@Controller('balance-sheet')
class BalanceSheetController {
  constructor(private readonly svc: BalanceSheetService) {}

  @Get()
  async get(
    @QueryParam('companyId') companyId: string,
    @QueryParam('asOf') asOf?: string,
  ) {
    return this.svc.compute(companyId, asOf ? new Date(asOf) : undefined);
  }
}

@Module({
  controllers: [BalanceSheetController],
  providers: [BalanceSheetService, PrismaService],
  exports: [BalanceSheetService],
})
export class BalanceSheetModule {}
