import type { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { assignRequestId } from './common/logging/requestId.js';
import { PRIVATE_NO_STORE } from './common/cache/cacheControl.js';
import { AUTH } from './modules/auth/auth.constants.js';
import type { Auth } from './modules/auth/auth.js';
import { createAuthRateLimit } from './modules/auth/authRateLimit.js';
import { setupOpenApi } from './common/openapi/openapi.js';

// Every /api/auth/* response is personal: session cookies, OAuth redirects, the session itself.
function noStore(_request: Request, response: Response, next: NextFunction) {
  response.setHeader('Cache-Control', PRIVATE_NO_STORE);
  next();
}

/** Applies the HTTP setup main.ts and the integration tests share; the app must be created with `bodyParser: false`. */
export function configureApp(app: NestExpressApplication) {
  // Exactly one trusted proxy hop: the client IP is the last X-Forwarded-For entry.
  app.set('trust proxy', 1);
  app.use(assignRequestId);
  // helmet's default CSP (`default-src 'self'`) covers JSON responses and Swagger UI alike.
  app.use(
    helmet({
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    );
    next();
  });
  // Better Auth is mounted here, before the JSON parser: it needs the raw body.
  app.use('/api/auth', noStore, createAuthRateLimit(), toNodeHandler(app.get<Auth>(AUTH)));
  // /me/merge registers its 512 KB express.json() above this line; the global parser skips a body already parsed.
  app.use(express.json({ limit: '100kb' }));
  app.setGlobalPrefix('api/v1');
  setupOpenApi(app);
}
