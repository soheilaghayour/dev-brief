/** Sends an error caught by an error boundary to Sentry; does nothing without a DSN. */
export function reportClientError(error: unknown) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  void import('@sentry/nextjs').then((Sentry) => Sentry.captureException(error));
}
