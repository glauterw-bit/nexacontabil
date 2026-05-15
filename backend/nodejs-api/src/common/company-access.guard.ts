import { CanActivate, ExecutionContext, Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/**
 * Verifica se o usuario autenticado tem acesso a empresa em questao.
 * Procura companyId em:
 *  - request.params.companyId
 *  - request.query.companyId
 *  - request.body.companyId
 *
 * Regras de acesso:
 *  - role 'owner'|'admin' (sócio do escritorio) — vê todas as empresas
 *  - role 'contador'|'assistente' — vê todas as empresas (poderá ser refinado por relação user-company)
 *  - role 'cliente' — vê APENAS a empresa onde user.companyId === companyId
 *
 * Quando o sistema for multi-escritorio, basta adicionar campo officeId em Company e
 * comparar com officeId do user.
 */
@Injectable()
export class CompanyAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('Autenticacao requerida');
    }

    const companyId: string | undefined =
      req.params?.companyId || req.query?.companyId || req.body?.companyId;

    // se a rota nao referencia companyId, libera (responsabilidade do controller)
    if (!companyId) return true;

    // role 'cliente' so acessa sua propria empresa
    if (user.role === 'cliente') {
      if (user.companyId === companyId) return true;
      throw new ForbiddenException('Sem acesso a essa empresa');
    }

    // demais roles do escritorio veem todas as empresas (single-office)
    if (['owner', 'admin', 'contador', 'assistente', 'user'].includes(user.role)) {
      // valida que a empresa existe (defensivo)
      const exists = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
      if (!exists) throw new BadRequestException('Empresa nao encontrada');
      return true;
    }

    throw new ForbiddenException('Role desconhecida');
  }
}
