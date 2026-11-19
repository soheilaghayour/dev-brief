import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request, Response } from 'express';
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
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const { headers, response: session } = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
      returnHeaders: true,
    });
    if (!session) throw new ApiException('UNAUTHENTICATED', 'Sign in to continue.');
    // A day-old session is extended here; without its new cookie the browser still drops it after 30 days.
    for (const cookie of headers.getSetCookie()) {
      http.getResponse<Response>().append('Set-Cookie', cookie);
    }
    request.currentUser = { id: session.user.id };
    return true;
  }
}
