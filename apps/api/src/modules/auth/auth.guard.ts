import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request, Response } from 'express';
import { ApiException } from '../../common/errors/api.exception.js';
import { AUTH } from './auth.constants.js';
import type { Auth } from './auth.js';

export type CurrentUserData = { id: string };

export type AuthenticatedRequest = Request & { currentUser: CurrentUserData };

/** The signed-in user of the request, or undefined for a guest; a day-old session is extended here. */
async function readSessionUser(auth: Auth, http: ReturnType<ExecutionContext['switchToHttp']>) {
  const request = http.getRequest<Request>();
  const { headers, response: session } = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
    returnHeaders: true,
  });
  // Without the new cookie the browser still drops a rolled session after 30 days.
  for (const cookie of headers.getSetCookie()) {
    http.getResponse<Response>().append('Set-Cookie', cookie);
  }
  return session ? { id: session.user.id } : undefined;
}

/** Requires a valid session and exposes its user to `@CurrentUser()`; answers 401 UNAUTHENTICATED otherwise. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext) {
    const http = context.switchToHttp();
    const user = await readSessionUser(this.auth, http);
    if (!user) throw new ApiException('UNAUTHENTICATED', 'Sign in to continue.');
    http.getRequest<AuthenticatedRequest>().currentUser = user;
    return true;
  }
}

/** Sets `currentUser` when the request has a valid session and lets a guest through; the route reads `@CurrentUser()` as possibly undefined. */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext) {
    const http = context.switchToHttp();
    const user = await readSessionUser(this.auth, http);
    if (user) http.getRequest<AuthenticatedRequest>().currentUser = user;
    return true;
  }
}
