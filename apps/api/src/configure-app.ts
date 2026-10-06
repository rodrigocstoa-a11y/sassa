import type { NestExpressApplication } from '@nestjs/platform-express';

/** Configuração comum à aplicação real e aos testes. */
export function configureApp(app: NestExpressApplication) {
  app.setGlobalPrefix('api');
  // Roteiros longos: o limite padrão de 100 KB não serve. O schema limita o conteúdo a 1.000.000 de caracteres.
  app.useBodyParser('json', { limit: '8mb' });
}
