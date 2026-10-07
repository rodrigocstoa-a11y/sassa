import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { allowedWebOrigins } from '../configure-app';
import { authEnabled } from '../config';
import type { AuthedRequest } from './auth.middleware';
import { IS_PUBLIC } from './public.decorator';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest<AuthedRequest & Request>();

    // Defesa em profundidade contra CSRF: pedidos que alteram dados vindos de outro site são recusados.
    const origin = req.headers.origin;
    if (!SAFE.has(req.method) && origin && !allowedWebOrigins().includes(origin)) {
      throw new ForbiddenException('Origem não autorizada');
    }
    if (isPublic || !authEnabled()) return true;
    if (!req.authUser) throw new UnauthorizedException('Faça login para continuar');
    return true;
  }
}
