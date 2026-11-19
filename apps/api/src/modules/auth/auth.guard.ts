import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { ApiException } from '../../common/errors/api.exception.js';
import { AUTH } from './auth.constants.js';
import type { Auth } from './auth.js';

export type CurrentUserData = { id: string };

export type AuthenticatedRequest = Request & { currentUser: CurrentUserData };

/** Requires a valid session and exposes its user to `@CurrentUser()`; answers 401 UNAUTHENTICATED otherwise. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw new ApiException('UNAUTHENTICATED', 'Sign in to continue.');
    request.currentUser = { id: session.user.id };
    return true;
  }
}
