import { httpIntegration } from '@sentry/nestjs';
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
    // The SDK attaches incoming request bodies by default, whatever sendDefaultPii says; the scrub is the second line of defence.
    integrations: [httpIntegration({ maxIncomingRequestBodySize: 'none' })],
    beforeSend: scrubSentryEvent,
    beforeBreadcrumb: scrubSentryBreadcrumb,
  };
}
