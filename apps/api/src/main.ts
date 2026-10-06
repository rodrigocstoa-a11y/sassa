import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { port } from './config';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configureApp(app);
  app.enableShutdownHooks();
  // Somente loopback: a API local não fica exposta na rede.
  await app.listen(port(), '127.0.0.1');
  console.log(`RRN Studio AI API em http://127.0.0.1:${port()}/api`);
}
void bootstrap();
