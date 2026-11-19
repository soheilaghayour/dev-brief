import { scrubSentryBreadcrumb, scrubSentryEvent } from '@devbrief/shared';

/** The web's Sentry options for the server and the browser; the scrub runs after the SDK has copied the request onto the event. */
export function sentryOptions(dsn: string) {
  return {
    dsn,
    release: process.env.NEXT_PUBLIC_APP_VERSION,
    environment: process.env.NODE_ENV,
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
    beforeBreadcrumb: scrubSentryBreadcrumb,
  };
}
