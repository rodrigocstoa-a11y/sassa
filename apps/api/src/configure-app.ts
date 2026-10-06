import type { NestExpressApplication } from '@nestjs/platform-express';

/** Origens do painel autorizadas a chamar a API direto do navegador (usado no envio de arquivos grandes). */
export function allowedWebOrigins(): string[] {
  return (process.env.WEB_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000').split(',').map((o) => o.trim()).filter(Boolean);
}

/** Configuração comum à aplicação real e aos testes. */
export function configureApp(app: NestExpressApplication) {
  app.setGlobalPrefix('api');
  // Roteiros longos: o limite padrão de 100 KB não serve. O schema limita o conteúdo a 1.000.000 de caracteres.
  app.useBodyParser('json', { limit: '8mb' });
  // O proxy do Next trunca corpos acima de 10 MB; por isso o envio de áudio vai direto do navegador à API.
  // CORS restrito às origens do painel (nunca '*').
  app.enableCors({ origin: allowedWebOrigins(), methods: ['GET', 'POST', 'PUT', 'DELETE'], maxAge: 600 });
}
