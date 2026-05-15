import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca uma rota como publica (sem JwtAuthGuard global).
 * Uso: @Public() em controllers ou metodos.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
