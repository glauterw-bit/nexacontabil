import { CanActivate, ExecutionContext, Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Verifica se o usuario autenticado tem acesso a empresa em questao.
 * Roda DEPOIS do JwtAuthGuard.
 *
 * - Rotas marcadas @Public(): nao bloqueia (mesmo sem user).
 * - Sem companyId na request: passa (responsabilidade do controller).
 * - Role 'cliente': so a propria empresa.
 * - Demais roles: acesso liberado a qualquer empresa (single-office).
 */
@Injectable()
export class CompanyAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) {
      // JwtAuthGuard deveria ter bloqueado antes; defensivo
      return false;
    }

    const companyId: string | undefined =
      req.params?.companyId || req.query?.companyId || req.body?.companyId;

    if (!companyId) return true;

    if (user.role === 'cliente') {
      if (user.companyId === companyId) return true;
      throw new ForbiddenException('Sem acesso a essa empresa');
    }

    if (['owner', 'admin', 'contador', 'assistente', 'user'].includes(user.role)) {
      const exists = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      });
      if (!exists) throw new BadRequestException('Empresa nao encontrada');
      return true;
    }

    throw new ForbiddenException('Role desconhecida');
  }
}
