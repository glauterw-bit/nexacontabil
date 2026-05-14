import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CostCentersService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.costCenter.findMany({
      where: { companyId, active: true },
      orderBy: { codigo: 'asc' },
    });
  }

  async create(data: { companyId: string; codigo: string; nome: string; parentId?: string; responsavel?: string }) {
    try {
      return await this.prisma.costCenter.create({ data });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Codigo de centro de custo ja existe');
      throw e;
    }
  }

  async update(id: string, patch: any) {
    const found = await this.prisma.costCenter.findUnique({ where: { id } });
    if (!found) throw new NotFoundException();
    return this.prisma.costCenter.update({ where: { id }, data: patch });
  }

  remove(id: string) {
    return this.prisma.costCenter.update({ where: { id }, data: { active: false } });
  }
}
