import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface CreateCompanyDto {
  name: string;
  cnpj: string;
  taxRegime: string;
  address?: string;
  phone?: string;
  email?: string;
}

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.company.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException(`Empresa ${id} não encontrada`);
    return company;
  }

  async findByCnpj(cnpj: string) {
    return this.prisma.company.findUnique({
      where: { cnpj: cnpj.replace(/\D/g, '') },
    });
  }

  async create(data: CreateCompanyDto) {
    const cleanCnpj = data.cnpj.replace(/\D/g, '');
    const existing = await this.findByCnpj(cleanCnpj);
    if (existing) throw new ConflictException(`CNPJ ${data.cnpj} já cadastrado`);

    return this.prisma.company.create({
      data: { ...data, cnpj: cleanCnpj },
    });
  }

  async update(id: string, data: Partial<CreateCompanyDto>) {
    await this.findById(id);
    return this.prisma.company.update({ where: { id }, data });
  }

  async deactivate(id: string) {
    await this.findById(id);
    return this.prisma.company.update({
      where: { id },
      data: { active: false },
    });
  }

  async getStats(id: string) {
    const [documents, transactions] = await Promise.all([
      this.prisma.document.count({ where: { companyId: id } }),
      this.prisma.transaction.count({ where: { companyId: id } }),
    ]);
    return { documents, transactions };
  }
}
