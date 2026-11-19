import { scrubSentryBreadcrumb, scrubSentryEvent } from '@devbrief/shared';
import type { loadEnv } from './env.js';

/** The api's Sentry options; the scrub runs last, after the SDK has copied the request onto the event. */
export function sentryOptions(
  env: Pick<ReturnType<typeof loadEnv>, 'SENTRY_DSN' | 'APP_VERSION' | 'NODE_ENV'>,
) {
  return {
    // Sentry stays off (no-op) when the DSN is unset.
    dsn: env.SENTRY_DSN,
    release: env.APP_VERSION,
    environment: env.NODE_ENV,
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
    beforeBreadcrumb: scrubSentryBreadcrumb,
  };
}
