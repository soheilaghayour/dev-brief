// The DSN is inlined at build time (NEXT_PUBLIC_*). Sentry loads after the page does, so its
// weight stays out of first-load JS (§8.5 budgets); errors thrown before that are not reported.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn,
      release: process.env.NEXT_PUBLIC_APP_VERSION,
      environment: process.env.NODE_ENV,
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
  });
}
