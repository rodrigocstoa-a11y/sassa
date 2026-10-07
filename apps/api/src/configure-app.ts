import type { NestExpressApplication } from '@nestjs/platform-express';

/** Origens do painel autorizadas a chamar a API direto do navegador (usado no envio de arquivos grandes). */
export function allowedWebOrigins(): string[] {
  return (process.env.WEB_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000').split(',').map((o) => o.trim()).filter(Boolean);
}

/** Configuração comum à aplicação real e aos testes. */
export function configureApp(app: NestExpressApplication) {
  app.setGlobalPrefix('api');
  // Atrás de proxy (Railway, Fly, Cloudflare): usa o IP real do cliente (limite de tentativas de login).
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  // Roteiros longos: o limite padrão de 100 KB não serve. O schema limita o conteúdo a 1.000.000 de caracteres.
  app.useBodyParser('json', { limit: '8mb' });
  // Arquivos grandes não passam pela API nem pelo proxy do Next: vão direto ao armazenamento por URL assinada.
  // CORS restrito às origens do painel (nunca '*').
  app.enableCors({ origin: allowedWebOrigins(), methods: ['GET', 'POST', 'PUT', 'DELETE'], credentials: true, maxAge: 600 });
}
