import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
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

  /**
   * Cria um login (role=analista) para cada responsável da carteira.
   * Idempotente: se o e-mail já existe, não recria. Retorna as credenciais
   * para o gestor distribuir. Senha padrão deve ser trocada no 1º acesso.
   */
  async provisionarEquipe(senhaPadrao = 'Nexa@2026') {
    const responsaveis = await this.prisma.company.findMany({
      where: { responsavel: { not: null } },
      select: { responsavel: true }, distinct: ['responsavel'],
    });
    const slug = (nome: string) => nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, '.');
    const out: { nome: string; email: string; senha: string; status: string }[] = [];
    for (const r of responsaveis) {
      const nome = r.responsavel!;
      const email = `${slug(nome)}@domo.com.br`;
      const existing = await this.prisma.user.findUnique({ where: { email } });
      if (existing) {
        if (existing.role !== 'analista') await this.prisma.user.update({ where: { id: existing.id }, data: { role: 'analista' } });
        out.push({ nome, email, senha: '(já existente)', status: 'existente' });
        continue;
      }
      await this.prisma.user.create({
        data: { name: nome, email, password: await bcrypt.hash(senhaPadrao, 10), role: 'analista', active: true },
      });
      out.push({ nome, email, senha: senhaPadrao, status: 'criado' });
    }
    return { total: out.length, criados: out.filter((o) => o.status === 'criado').length, analistas: out };
  }

  /** Só dono/gestor administram contas da equipe. */
  private _ehGestor(role?: string) {
    return ['owner', 'admin', 'contador'].includes(role ?? '');
  }

  /**
   * ADMIN: cria uma conta de analista. O `name` é usado para casar com o
   * `responsavel` das empresas (Meu Dia / Painel do Analista filtram por ele),
   * então idealmente igual ao nome que está na carteira.
   */
  async criarAnalista(currentUser: any, dto: { name: string; email: string; password: string; role?: string }) {
    if (!this._ehGestor(currentUser?.role)) throw new ForbiddenException('Só o gestor pode criar contas.');
    const name = (dto.name ?? '').trim();
    const email = (dto.email ?? '').trim().toLowerCase();
    if (!name || !email) throw new BadRequestException('Nome e e-mail são obrigatórios.');
    if ((dto.password ?? '').length < 6) throw new BadRequestException('A senha precisa de ao menos 6 caracteres.');
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Já existe uma conta com esse e-mail.');
    const role = dto.role === 'assistente' ? 'assistente' : 'analista';
    const user = await this.prisma.user.create({
      data: { name, email, password: await bcrypt.hash(dto.password, 10), role, active: true },
    });
    // quantos clientes esse analista já enxerga (nome bate com responsavel?)
    const carteira = await this.prisma.company.count({ where: { responsavel: name } });
    return { id: user.id, name: user.name, email: user.email, role: user.role, clientesVinculados: carteira };
  }

  /** ADMIN: redefine a senha de um usuário da equipe (não mexe no dono). */
  async redefinirSenha(currentUser: any, userId: string, novaSenha: string) {
    if (!this._ehGestor(currentUser?.role)) throw new ForbiddenException('Só o gestor pode redefinir senhas.');
    if ((novaSenha ?? '').length < 6) throw new BadRequestException('A nova senha precisa de ao menos 6 caracteres.');
    const alvo = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, name: true, email: true } });
    if (!alvo) throw new NotFoundException('Usuário não encontrado.');
    if (alvo.role === 'owner') throw new ForbiddenException('A conta do dono não pode ser redefinida por aqui.');
    await this.prisma.user.update({ where: { id: userId }, data: { password: await bcrypt.hash(novaSenha, 10) } });
    return { ok: true, usuario: { id: alvo.id, name: alvo.name, email: alvo.email } };
  }

  /** ADMIN: ativa/desativa uma conta (desligar analista que saiu, sem apagar histórico). */
  async definirAtivo(currentUser: any, userId: string, ativo: boolean) {
    if (!this._ehGestor(currentUser?.role)) throw new ForbiddenException('Só o gestor pode alterar contas.');
    const alvo = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!alvo) throw new NotFoundException('Usuário não encontrado.');
    if (alvo.role === 'owner') throw new ForbiddenException('A conta do dono não pode ser desativada.');
    await this.prisma.user.update({ where: { id: userId }, data: { active: ativo } });
    return { ok: true, ativo };
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
