import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { CacheModule } from './cache/cache.module.js';
import { ENV, EnvModule, type Env } from './env/env.module.js';
import { ApiErrorFilter } from './errors/apiError.filter.js';
import { FeatureGuard } from './features/feature.guard.js';
import { pinoHttpOptions } from './logging/pinoHttpOptions.js';
import { OriginGuard } from './origin-guard/origin.guard.js';
import { RATE_LIMIT_PER_MINUTE, RateLimitGuard } from './rate-limit/rateLimit.guard.js';
import { OutputValidationInterceptor } from './zod/outputValidation.interceptor.js';

/** Wires the cross-cutting conventions every feature module relies on. */
@Module({
  imports: [
    EnvModule,
    CacheModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: pinoHttpOptions(env),
      }),
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: RATE_LIMIT_PER_MINUTE }],
      // The default key includes the route, which would make the limit per route instead of per IP.
      generateKey: (_context, tracker) => tracker,
    }),
  ],
  providers: [
    // First, so a route behind an off flag answers like an unknown route: 404, never 403 or 429.
    { provide: APP_GUARD, useClass: FeatureGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_FILTER, useClass: ApiErrorFilter },
    { provide: APP_INTERCEPTOR, useClass: OutputValidationInterceptor },
  ],
})
export class CommonModule {}
