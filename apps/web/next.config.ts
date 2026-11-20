import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';
import { securityHeaders } from './src/config/securityHeaders';
import { validateFeatureFlagEnv } from './src/env';

validateFeatureFlagEnv();

const nextConfig: NextConfig = {
  output: 'standalone',
  // Next regenerates apps/web/AGENTS.md otherwise; agent rules live only in CLAUDE.md.
  agentRules: false,
  // Inlines the stylesheet into <head>: the external <link> blocks render and costs a second round trip (DECISIONS.md).
  experimental: { inlineCss: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders(process.env.NODE_ENV) }];
  },
  // Stands in for the production proxy in dev and in the e2e build; production builds leave API_PROXY_URL unset.
  async rewrites() {
    const target = process.env.API_PROXY_URL;
    return target ? [{ source: '/api/:path*', destination: `${target}/api/:path*` }] : [];
  },
};

// Source maps upload only when SENTRY_AUTH_TOKEN is set at build time; local and CI builds skip it.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  release: { name: process.env.NEXT_PUBLIC_APP_VERSION },
  silent: true,
  telemetry: false,
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
