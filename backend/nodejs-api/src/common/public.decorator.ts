import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const IS_ABERTO_KEY = 'isAberto';

/**
 * Rota INTERNA/operacional: aceita login (JWT) OU o header `x-internal-token`
 * igual a env INTERNAL_API_TOKEN (diagnóstico/automação). NÃO é mais aberta ao mundo.
 * (Historicamente @Public() = sem auth; endurecido — dados de clientes estavam expostos.)
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Rota GENUINAMENTE pública (sem nenhuma auth): login/registro, health,
 * callbacks OAuth e webhooks chamados por terceiros (Graph/WhatsApp).
 * Use com parcimônia — tudo aqui é alcançável pela internet.
 */
export const Aberto = () => SetMetadata(IS_ABERTO_KEY, true);
