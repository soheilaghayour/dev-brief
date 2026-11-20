import { Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../modules/auth/auth.guard.js';
import { enforceWindowLimit } from './enforceWindowLimit.js';
import { RateLimitWindows } from './userRateLimit.module.js';

const LIMIT_KEY = 'rateLimit:perUser';

type UserLimit = { bucket: string; perMinute: number };

/** The per-user mutations limit of PRD §8.6, one bucket for every mutating `/me` route. */
export const MUTATIONS_LIMIT = { bucket: 'mutations', perMinute: 60 } satisfies UserLimit;

/** Limits a route to `perMinute` requests per user per minute; routes sharing a `bucket` share the count. */
export const UserRateLimit = (limit: UserLimit) => SetMetadata(LIMIT_KEY, limit);

/** Enforces `@UserRateLimit`; must run after AuthGuard, which sets the user. In-memory, like the global limit (single instance). */
@Injectable()
export class UserRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly windows: RateLimitWindows,
  ) {}

  canActivate(context: ExecutionContext) {
    const limit = this.reflector.get<UserLimit | undefined>(LIMIT_KEY, context.getHandler());
    if (!limit) return true;
    const http = context.switchToHttp();
    const { currentUser } = http.getRequest<AuthenticatedRequest>();
    enforceWindowLimit(this.windows, http.getResponse<Response>(), {
      key: `${limit.bucket}:${currentUser.id}`,
      perMinute: limit.perMinute,
    });
    return true;
  }
}
