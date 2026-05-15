import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('E-mail já cadastrado');

    const hashed = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashed,
        role: 'admin',
        companyId: dto.companyId ?? null,
      },
    });

    return this._buildResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.active) throw new UnauthorizedException('Credenciais inválidas');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas');

    return this._buildResponse(user);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        createdAt: true,
        company: { select: { id: true, name: true, cnpj: true } },
      },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  async listUsers(currentUser: any, role?: string) {
    // cliente nao lista outros usuarios
    if (currentUser?.role === 'cliente') return [];
    return this.prisma.user.findMany({
      where: { active: true, ...(role ? { role } : {}) },
      select: { id: true, name: true, email: true, role: true, companyId: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
  }

  async updateProfile(userId: string, data: { name?: string; password?: string }) {
    const update: any = {};
    if (data.name) update.name = data.name;
    if (data.password) update.password = await bcrypt.hash(data.password, 10);
    return this.prisma.user.update({
      where: { id: userId },
      data: update,
      select: { id: true, email: true, name: true, role: true },
    });
  }

  private _buildResponse(user: any) {
    const token = this.jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
    );
    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
      },
    };
  }
}
