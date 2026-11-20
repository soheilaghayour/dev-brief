import { Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { enforceWindowLimit } from './userRateLimit.guard.js';
import { UserRateLimitWindows } from './userRateLimit.module.js';

const LIMIT_KEY = 'rateLimit:perIp';

type IpLimit = { bucket: string; perMinute: number };

/** The short-window limit of PRD §8.6 for the on-demand summary route. */
export const SUMMARY_IP_LIMIT = { bucket: 'summary', perMinute: 5 } satisfies IpLimit;

/** Limits a route to `perMinute` requests per client IP per minute, on top of the global limit. */
export const IpRateLimit = (limit: IpLimit) => SetMetadata(LIMIT_KEY, limit);

/** Enforces `@IpRateLimit` on Express's one-hop `req.ip`; in-memory, like the global limit (single instance). */
@Injectable()
export class IpRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly windows: UserRateLimitWindows,
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
