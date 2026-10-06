import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { port } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  // Somente loopback: a API local não fica exposta na rede.
  await app.listen(port(), '127.0.0.1');
  console.log(`RRN Studio AI API em http://127.0.0.1:${port()}/api`);
}
void bootstrap();
