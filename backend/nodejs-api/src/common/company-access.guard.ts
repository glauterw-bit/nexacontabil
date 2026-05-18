import { CanActivate, ExecutionContext, Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
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

    // GraphQL: extrai req do contexto Apollo; REST: switchToHttp
    let req: any;
    let gqlArgs: any = null;
    if (ctx.getType<any>() === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(ctx);
      req = gqlCtx.getContext()?.req;
      gqlArgs = gqlCtx.getArgs();
    } else {
      req = ctx.switchToHttp().getRequest();
    }

    if (!req) return false;
    const user = req.user;
    if (!user) {
      // JwtAuthGuard deveria ter bloqueado antes; defensivo
      return false;
    }

    // companyId pode vir de params/query/body (REST) ou de args do resolver (GraphQL)
    const companyId: string | undefined =
      req.params?.companyId ||
      req.query?.companyId ||
      req.body?.companyId ||
      gqlArgs?.companyId ||
      gqlArgs?.input?.companyId;

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
