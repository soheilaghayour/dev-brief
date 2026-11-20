import { Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { enforceWindowLimit } from './enforceWindowLimit.js';
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
  ) {}

  canActivate(context: ExecutionContext) {
    const limit = this.reflector.get<IpLimit | undefined>(LIMIT_KEY, context.getHandler());
    if (!limit) return true;
    const http = context.switchToHttp();
    enforceWindowLimit(this.windows, http.getResponse<Response>(), {
      key: `${limit.bucket}:ip:${http.getRequest<Request>().ip ?? ''}`,
      perMinute: limit.perMinute,
    });
    return true;
  }
}
