import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ENV, type Env } from '../env/env.module.js';
import { ApiException } from '../errors/api.exception.js';

// Express answers HEAD with the GET handler.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Rejects every state-changing request whose Origin is not APP_URL (CSRF defence on top of SameSite=Lax). */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly appOrigin: string;

  constructor(@Inject(ENV) env: Env) {
    this.appOrigin = new URL(env.APP_URL).origin;
  }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method) || request.headers.origin === this.appOrigin) return true;
    throw new ApiException('FORBIDDEN_ORIGIN', 'Requests must come from the app origin.');
  }
}
