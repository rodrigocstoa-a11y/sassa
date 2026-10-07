import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
/** Rota acessível sem sessão (login, health, envio com token assinado). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
