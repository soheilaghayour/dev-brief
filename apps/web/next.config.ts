import type { NextConfig } from 'next';
import { loadEnv } from './src/env.ts';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Next regenerates apps/web/AGENTS.md otherwise; agent rules live only in CLAUDE.md.
  agentRules: false,
  // Mimics the production proxy, which routes /api/* to the api; dev only.
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return [];
    const env = loadEnv();
    return [{ source: '/api/:path*', destination: `${env.API_INTERNAL_URL}/api/:path*` }];
  },
};

export default nextConfig;
