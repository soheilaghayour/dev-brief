import type { captureRequestError } from '@sentry/nextjs';
import { loadEnv } from './env';
import { sentryOptions } from './lib/observability/sentryOptions';

// Runs at server start, so a bad environment fails fast in the standalone production server too.
export async function register() {
  try {
    loadEnv();
  } catch (error) {
    console.error(error);
    // Next logs a failed hook and keeps serving, so the process must exit itself.
    if (process.env.NEXT_RUNTIME === 'nodejs') process.exit(1);
    throw error;
  }
  // Sentry stays off (no-op) when the DSN is unset.
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn && process.env.NEXT_RUNTIME === 'nodejs') {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init(sentryOptions(dsn));
  }
}

export async function onRequestError(...args: Parameters<typeof captureRequestError>) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(...args);
}
