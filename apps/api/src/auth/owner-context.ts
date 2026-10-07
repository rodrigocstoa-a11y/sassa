import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/** Dono dos dados quando a autenticação está desligada (somente desenvolvimento e testes). */
export const LOCAL_OWNER = 'local';

interface Store {
  ownerId: string;
  userId: string | null;
}

const als = new AsyncLocalStorage<Store>();

/**
 * Identifica quem é o dono dos dados na execução atual: o usuário logado numa requisição HTTP
 * ou o dono do job num worker. Todo acesso a dados filtra por este dono (multiusuário por padrão).
 */
@Injectable()
export class OwnerContext {
  run<T>(store: Store, fn: () => T): T {
    return als.run(store, fn);
  }

  current(): string {
    const s = als.getStore();
    if (!s) throw new UnauthorizedException('Autenticação necessária');
    return s.ownerId;
  }

  userId(): string | null {
    return als.getStore()?.userId ?? null;
  }
}
