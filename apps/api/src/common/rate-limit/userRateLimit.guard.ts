import {
  Global,
  Injectable,
  Module,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../modules/auth/auth.guard.js';

const WINDOW_MS = 60_000;
const LIMIT_KEY = 'rateLimit:perUser';

type UserLimit = { bucket: string; perMinute: number };
type Window = { startedAt: number; count: number };

/** The per-user mutations limit of PRD §8.6, one bucket for every mutating `/me` route. */
export const MUTATIONS_LIMIT = { bucket: 'mutations', perMinute: 60 } satisfies UserLimit;

/** Limits a route to `perMinute` requests per user per minute; routes sharing a `bucket` share the count. */
export const UserRateLimit = (limit: UserLimit) => SetMetadata(LIMIT_KEY, limit);

/** The open window per bucket and user, one instance app-wide. */
@Injectable()
export class UserRateLimitWindows {
  private readonly windows = new Map<string, Window>();

  /** Counts one request against the key's window, opening a new window when the last one ended. */
  hit(key: string, now: number) {
    let window = this.windows.get(key);
    if (!window || now - window.startedAt >= WINDOW_MS) {
      this.dropExpired(now);
      window = { startedAt: now, count: 0 };
      this.windows.set(key, window);
    }
    window.count += 1;
    return window;
  }

  private dropExpired(now: number) {
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= WINDOW_MS) this.windows.delete(key);
    }
  }
}

/** Enforces `@UserRateLimit`; must run after AuthGuard, which sets the user. In-memory, like the global limit (single instance). */
@Injectable()
export class UserRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly windows: UserRateLimitWindows,
  ) {}

  canActivate(context: ExecutionContext) {
    const limit = this.reflector.get<UserLimit | undefined>(LIMIT_KEY, context.getHandler());
    if (!limit) return true;
    const http = context.switchToHttp();
    const { currentUser } = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const now = Date.now();
    const window = this.windows.hit(`${limit.bucket}:${currentUser.id}`, now);

    const secondsToReset = String(Math.ceil((window.startedAt + WINDOW_MS - now) / 1000));
    response.setHeader('RateLimit-Limit', String(limit.perMinute));
    response.setHeader('RateLimit-Remaining', String(Math.max(0, limit.perMinute - window.count)));
    response.setHeader('RateLimit-Reset', secondsToReset);
    if (window.count <= limit.perMinute) return true;
    response.setHeader('Retry-After', secondsToReset);
    throw new ThrottlerException();
  }
}

// Nest builds one guard instance per module that uses it, so the windows live in a global provider for buckets to span modules.
@Global()
@Module({ providers: [UserRateLimitWindows], exports: [UserRateLimitWindows] })
export class UserRateLimitModule {}
