import { Global, MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthMiddleware } from './auth.middleware';
import { AuthService } from './auth.service';
import { OwnerContext } from './owner-context';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, OwnerContext, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService, OwnerContext],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
