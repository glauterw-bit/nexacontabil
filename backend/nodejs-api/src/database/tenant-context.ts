/**
 * AsyncLocalStorage para guardar o contexto do request (user/companyId)
 * usado pelo Prisma middleware para Row-Level Security simulada via app.
 */
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  userId?: string;
  role?: string;
  companyId?: string;
  bypassRls?: boolean;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

export function runWithTenant<T>(ctx: TenantContext, fn: () => T): T {
  return tenantStorage.run(ctx, fn);
}
