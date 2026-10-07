import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { port, role } from './config';
import { configureApp } from './configure-app';

async function bootstrap() {
  if (role() === 'worker') {
    // Processo só de fila (sem HTTP): é como o worker roda na nuvem.
    const app = await NestFactory.createApplicationContext(AppModule);
    app.enableShutdownHooks();
    new Logger('Worker').log('Worker de jobs em execução');
    return;
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configureApp(app);
  app.enableShutdownHooks();
  // HOST=0.0.0.0 na nuvem (atrás do proxy da plataforma); em desenvolvimento só loopback.
  const host = process.env.HOST ?? '127.0.0.1';
  await app.listen(port(), host);
  new Logger('API').log(`RRN Studio AI API em http://${host}:${port()}/api (função: ${role()})`);
}
void bootstrap();
