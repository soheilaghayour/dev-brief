import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import helmet from 'helmet';
import { setupOpenApi } from './common/openapi/openapi.js';

/** Applies the HTTP setup main.ts and the integration tests share; the app must be created with `bodyParser: false`. */
export function configureApp(app: NestExpressApplication) {
  // Exactly one trusted proxy hop: the client IP is the last X-Forwarded-For entry.
  app.set('trust proxy', 1);
  // The API serves JSON only; CSP is set by the web app's headers, and Swagger UI needs inline scripts.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  // Better Auth is mounted here, before the JSON parser: it needs the raw body.
  app.use(express.json({ limit: '100kb' }));
  app.setGlobalPrefix('api/v1');
  setupOpenApi(app);
}
