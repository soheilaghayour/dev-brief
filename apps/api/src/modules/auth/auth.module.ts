import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../../common/env/env.module.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AUTH } from './auth.constants.js';
import { AuthGuard } from './auth.guard.js';
import { createAuth } from './auth.js';
import { MeController } from './me.controller.js';
import { MeService } from './me.service.js';

/** Provides the Better Auth instance, the AuthGuard and the /me endpoints. */
@Global()
@Module({
  controllers: [MeController],
  providers: [
    {
      provide: AUTH,
      inject: [ENV, PrismaService],
      useFactory: (env: Env, prisma: PrismaService) => createAuth(env, prisma),
    },
    AuthGuard,
    MeService,
  ],
  exports: [AUTH, AuthGuard],
})
export class AuthModule {}
