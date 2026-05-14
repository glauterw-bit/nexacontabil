import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Role } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const req = ctx.switchToHttp().getRequest();
    const userRole: string | undefined = req.user?.role;
    if (!userRole) throw new ForbiddenException('Autenticacao necessaria');
    if (!required.includes(userRole as Role)) {
      throw new ForbiddenException(`Acesso negado. Roles requeridas: ${required.join(', ')}`);
    }
    return true;
  }
}
