import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export type Role = 'owner' | 'contador' | 'assistente' | 'cliente';

/**
 * @Roles('owner','contador')  -> aceita owner OU contador
 * Sem decorator -> rota aberta
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
