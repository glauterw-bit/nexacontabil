import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';
import { IS_PUBLIC_KEY, IS_ABERTO_KEY } from '../../../common/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // @Aberto(): genuinamente público (login, health, callbacks OAuth, webhooks de terceiros)
    const isAberto = this.reflector.getAllAndOverride<boolean>(IS_ABERTO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isAberto) return true;
    // @Public(): rota INTERNA — aceita o token operacional (x-internal-token) OU um JWT válido.
    // Antes era acesso livre; endurecido pq expunha dados de clientes sem login.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic && this.tokenInternoValido(context)) return true;
    return super.canActivate(context);
  }

  private tokenInternoValido(context: ExecutionContext): boolean {
    const esperado = process.env.INTERNAL_API_TOKEN;
    if (!esperado) return false; // sem env configurada → só JWT (seguro por padrão)
    const req = this.getRequest(context);
    const dado = String(req?.headers?.['x-internal-token'] ?? '');
    if (!dado || dado.length !== esperado.length) return false;
    try { return timingSafeEqual(Buffer.from(dado), Buffer.from(esperado)); } catch { return false; }
  }

  // GraphQL: extrair request do contexto Apollo (necessario para guard global rodar em /graphql)
  getRequest(context: ExecutionContext) {
    if (context.getType<any>() === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context);
      return gqlCtx.getContext().req;
    }
    return context.switchToHttp().getRequest();
  }
}
