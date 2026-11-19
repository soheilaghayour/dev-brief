import * as Sentry from '@sentry/nestjs';
import { loadEnv } from './env.js';

// Imported first by main.ts so Sentry can instrument Express and pg before they load.
const env = loadEnv();

Sentry.init({
  // Sentry stays off (no-op) when the DSN is unset.
  dsn: env.SENTRY_DSN,
  release: env.APP_VERSION,
  environment: env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: 0,
});
