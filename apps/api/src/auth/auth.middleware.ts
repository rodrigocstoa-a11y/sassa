import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { authEnabled } from '../config';
import { AuthService, type AuthUser } from './auth.service';
import { readCookie, SESSION_COOKIE } from './cookies';
import { LOCAL_OWNER, OwnerContext } from './owner-context';

export type AuthedRequest = Request & { authUser?: AuthUser | null };

/** Identifica o usuário pela sessão e abre o contexto de dono para o resto da requisição. */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    private readonly auth: AuthService,
    private readonly owner: OwnerContext,
  ) {}

  async use(req: AuthedRequest, _res: Response, next: NextFunction) {
    try {
      if (!authEnabled()) {
        req.authUser = null;
        return this.owner.run({ ownerId: LOCAL_OWNER, userId: null }, () => next());
      }
      const token = readCookie(req.headers.cookie, SESSION_COOKIE);
      const user = token ? await this.auth.validate(token) : null;
      req.authUser = user;
      if (user) return this.owner.run({ ownerId: user.id, userId: user.id }, () => next());
      next();
    } catch (err) {
      next(err);
    }
  }
}
