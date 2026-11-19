import { Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../modules/auth/auth.guard.js';

const WINDOW_MS = 60_000;
const LIMIT_KEY = 'rateLimit:perUser';

type UserLimit = { bucket: string; perMinute: number };
type Window = { startedAt: number; count: number };

/** Limits a route to `perMinute` requests per user per minute; routes sharing a `bucket` share the count. */
export const UserRateLimit = (limit: UserLimit) => SetMetadata(LIMIT_KEY, limit);

/** Enforces `@UserRateLimit`; must run after AuthGuard, which sets the user. In-memory, like the global limit (single instance). */
@Injectable()
export class UserRateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const limit = this.reflector.get<UserLimit | undefined>(LIMIT_KEY, context.getHandler());
    if (!limit) return true;
    const http = context.switchToHttp();
    const { currentUser } = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const now = Date.now();
    const key = `${limit.bucket}:${currentUser.id}`;

    let window = this.windows.get(key);
    if (!window || now - window.startedAt >= WINDOW_MS) {
      this.dropExpired(now);
      window = { startedAt: now, count: 0 };
      this.windows.set(key, window);
    }
    window.count += 1;

    const secondsToReset = String(Math.ceil((window.startedAt + WINDOW_MS - now) / 1000));
    response.setHeader('RateLimit-Limit', String(limit.perMinute));
    response.setHeader('RateLimit-Remaining', String(Math.max(0, limit.perMinute - window.count)));
    response.setHeader('RateLimit-Reset', secondsToReset);
    if (window.count <= limit.perMinute) return true;
    response.setHeader('Retry-After', secondsToReset);
    throw new ThrottlerException();
  }

  private dropExpired(now: number) {
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= WINDOW_MS) this.windows.delete(key);
    }
  }
}
