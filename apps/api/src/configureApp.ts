import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { assignRequestId } from './common/logging/requestId.js';
import { setupOpenApi } from './common/openapi/openapi.js';

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
  // /me/merge registers its 512 KB express.json() above this line; the global parser skips a body already parsed.
  app.use(express.json({ limit: '100kb' }));
  app.setGlobalPrefix('api/v1');
  setupOpenApi(app);
}
