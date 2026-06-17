import { Module } from '@nestjs/common';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizacaoService } from './organizacao.service';
import { PrismaService } from '../../database/prisma.service';

@Controller('organizacao')
@UseGuards(JwtAuthGuard)
class OrganizacaoController {
  constructor(private readonly service: OrganizacaoService) {}
  @Get('overview')
  overview() { return this.service.overview(); }
}

@Module({
  controllers: [OrganizacaoController],
  providers: [OrganizacaoService, PrismaService],
  exports: [OrganizacaoService],
})
export class OrganizacaoModule {}
