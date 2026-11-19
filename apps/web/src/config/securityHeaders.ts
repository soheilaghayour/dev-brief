const SENTRY_INGEST =
  'https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://*.ingest.us.sentry.io';

/** The CSP; `development` also allows eval, which React's dev tooling needs. */
export function contentSecurityPolicy(nodeEnv: string | undefined) {
  // No nonce: a nonce makes Next render every page dynamically, which the static landing page cannot afford.
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    ...(nodeEnv === 'production' ? [] : ["'unsafe-eval'"]),
  ];
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    // Tailwind and Next inject inline styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${SENTRY_INGEST}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** The response headers every web route carries (§8.6). */
export function securityHeaders(nodeEnv: string | undefined) {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(nodeEnv) },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    },
  ];
}
