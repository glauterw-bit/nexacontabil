import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface CreateBoletoDto {
  companyId: string;
  beneficiaryName: string;
  beneficiaryCnpj: string;
  payerName: string;
  payerCnpjCpf: string;
  payerEmail?: string;
  amount: number;
  dueDate: Date;
  bankCode?: string;
  instructions?: string;
  fine?: number;
  interest?: number;
  discount?: number;
}

@Injectable()
export class BoletosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Gera o "nosso número" único: 4 últimos chars do companyId + 8 dígitos do timestamp
   */
  private _generateOurNumber(companyId: string): string {
    const prefix = companyId.replace(/-/g, '').slice(-4).toUpperCase();
    const suffix = Date.now().toString().slice(-8);
    return `${prefix}${suffix}`;
  }

  /**
   * Gera um código de barras fictício no padrão brasileiro (44 dígitos).
   * Em produção, integrar com o banco emissor via API.
   */
  private _generateBarcode(
    bankCode: string,
    amount: number,
    ourNumber: string,
    dueDate: Date,
  ): string {
    const bank = bankCode.padStart(3, '0');
    const currency = '9'; // Real
    const amountStr = Math.round(amount * 100)
      .toString()
      .padStart(10, '0');
    const dueFactor = Math.floor(
      (dueDate.getTime() - new Date('1997-10-07').getTime()) / 86400000,
    )
      .toString()
      .padStart(4, '0');
    const freefield = ourNumber.padStart(25, '0');
    // barcode = banco + moeda + fator_venc + valor + campo_livre (sem dígito verificador neste stub)
    return `${bank}${currency}${dueFactor}${amountStr}${freefield}`;
  }

  /**
   * Gera a linha digitável a partir do código de barras (stub simplificado).
   */
  private _generateDigitableLine(barcode: string): string {
    // Formato simplificado: BBBMC.CCCCCCC DDDDD.DDDDDD EEEEE.EEEEEE F GGGGGGGGGGGGGGG
    const p1 = barcode.substring(0, 9);
    const p2 = barcode.substring(9, 19);
    const p3 = barcode.substring(19, 29);
    const factor = barcode.substring(29, 33);
    const amount = barcode.substring(33, 43);
    return `${p1} ${p2} ${p3} ${factor} ${amount}`;
  }

  async create(dto: CreateBoletoDto) {
    const ourNumber = this._generateOurNumber(dto.companyId);
    const bankCode = dto.bankCode ?? '000';
    const barcode = this._generateBarcode(bankCode, dto.amount, ourNumber, dto.dueDate);
    const digitableLine = this._generateDigitableLine(barcode);

    return this.prisma.boleto.create({
      data: {
        companyId: dto.companyId,
        beneficiaryName: dto.beneficiaryName,
        beneficiaryCnpj: dto.beneficiaryCnpj,
        payerName: dto.payerName,
        payerCnpjCpf: dto.payerCnpjCpf,
        payerEmail: dto.payerEmail,
        amount: dto.amount,
        dueDate: dto.dueDate,
        ourNumber,
        digitableLine,
        barcode,
        bankCode,
        instructions: dto.instructions,
        fine: dto.fine ?? 2.0,
        interest: dto.interest ?? 1.0,
        discount: dto.discount ?? 0,
        status: 'pending',
      },
    });
  }

  async findAll(companyId: string, status?: string) {
    return this.prisma.boleto.findMany({
      where: {
        companyId,
        ...(status && { status }),
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async findById(id: string) {
    const boleto = await this.prisma.boleto.findUnique({ where: { id } });
    if (!boleto) throw new NotFoundException(`Boleto ${id} não encontrado`);
    return boleto;
  }

  async markAsPaid(id: string, paidAmount?: number) {
    const boleto = await this.findById(id);
    return this.prisma.boleto.update({
      where: { id },
      data: {
        status: 'paid',
        paidAt: new Date(),
        paidAmount: paidAmount ?? boleto.amount,
      },
    });
  }

  async cancelBoleto(id: string) {
    await this.findById(id);
    return this.prisma.boleto.update({
      where: { id },
      data: { status: 'cancelled' },
    });
  }
}
