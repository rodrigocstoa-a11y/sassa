import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { authEnabled, isProduction } from '../config';
import { ZodValidationPipe } from '../zod-validation.pipe';
import type { AuthedRequest } from './auth.middleware';
import { AuthService } from './auth.service';
import { clearSessionCookie, readCookie, SESSION_COOKIE, sessionCookie } from './cookies';
import { Public } from './public.decorator';

const loginSchema = z.object({ email: z.string().trim().min(3).max(200), password: z.string().min(1).max(500) });

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodValidationPipe(loginSchema)) body: z.infer<typeof loginSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token, user, maxAgeSec } = await this.auth.login(body.email, body.password, req.ip ?? 'unknown');
    res.setHeader('Set-Cookie', sessionCookie(token, maxAgeSec, isProduction()));
    return { user: { email: user.email, role: user.role } };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (token) await this.auth.logout(token);
    res.setHeader('Set-Cookie', clearSessionCookie(isProduction()));
  }

  /** Estado da sessão para a interface decidir entre painel e tela de login. */
  @Public()
  @Get('me')
  me(@Req() req: AuthedRequest) {
    return {
      authRequired: authEnabled(),
      user: req.authUser ? { email: req.authUser.email, role: req.authUser.role } : null,
    };
  }
}
