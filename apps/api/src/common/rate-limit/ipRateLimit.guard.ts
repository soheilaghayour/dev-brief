import {
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { ENV, type Env } from '../env/env.module.js';
import { enforceWindowLimit } from './enforceWindowLimit.js';
import { hasInternalToken } from './rateLimit.guard.js';
import { RateLimitWindows } from './userRateLimit.module.js';

const LIMIT_KEY = 'rateLimit:perIp';

type IpLimit = { bucket: string; perMinute: number };

/** Limits a route to `perMinute` requests per client IP per minute, on top of the global limit. */
export const IpRateLimit = (limit: IpLimit) => SetMetadata(LIMIT_KEY, limit);

/** Enforces `@IpRateLimit` on Express's one-hop `req.ip`; in-memory, like the global limit (single instance). */
@Injectable()
export class IpRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly windows: RateLimitWindows,
    @Inject(ENV) private readonly env: Env,
  ) {}

  canActivate(context: ExecutionContext) {
    const limit = this.reflector.get<IpLimit | undefined>(LIMIT_KEY, context.getHandler());
    if (!limit) return true;
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    // The web app's server-side calls (and the e2e run, which is one visitor) are not a client IP.
    if (hasInternalToken(request, this.env)) return true;
    enforceWindowLimit(this.windows, http.getResponse<Response>(), {
      key: `${limit.bucket}:ip:${request.ip ?? ''}`,
      perMinute: limit.perMinute,
    });
    return true;
  }
}
