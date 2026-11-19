import type { NextConfig } from 'next';
import { loadEnv } from './src/env.ts';

const env = loadEnv();

const nextConfig: NextConfig = {
  output: 'standalone',
  // Mimics the production proxy, which routes /api/* to the api; dev only.
  async rewrites() {
    if (env.NODE_ENV !== 'development') return [];
    return [{ source: '/api/:path*', destination: 'http://localhost:3001/api/:path*' }];
  },
};

export default nextConfig;
