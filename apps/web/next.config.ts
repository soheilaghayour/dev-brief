import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Next regenerates apps/web/AGENTS.md otherwise; agent rules live only in CLAUDE.md.
  agentRules: false,
  // Stands in for the production proxy in dev and in the e2e build; production builds leave API_PROXY_URL unset.
  async rewrites() {
    const target = process.env.API_PROXY_URL;
    return target ? [{ source: '/api/:path*', destination: `${target}/api/:path*` }] : [];
  },
};

export default nextConfig;
