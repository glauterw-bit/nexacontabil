import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { runWithTenant } from '../database/tenant-context';
import * as jwt from 'jsonwebtoken';

/**
 * Middleware Express que decodifica o JWT (se houver) e propaga o contexto
 * via AsyncLocalStorage para o PrismaService aplicar RLS.
 *
 * Roda BEFORE dos guards — então funciona mesmo em rotas publicas (sem user).
 * Não valida o JWT (isso é responsabilidade do JwtAuthGuard) — apenas extrai
 * claims para hint.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const auth = req.headers.authorization;
    let userId: string | undefined;
    let role: string | undefined;
    let companyId: string | undefined;

    if (auth?.startsWith('Bearer ')) {
      const token = auth.slice(7);
      try {
        const decoded: any = jwt.decode(token);
        if (decoded) {
          userId = decoded.sub;
          role = decoded.role;
          companyId = decoded.companyId;
        }
      } catch {}
    }

    runWithTenant({ userId, role, companyId }, () => next());
  }
}
