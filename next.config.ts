import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // /api/admin/db-setup reads migration SQL files at runtime. Ensure Vercel
  // packages the drizzle/ folder with that serverless function bundle.
  outputFileTracingIncludes: {
    '/api/admin/db-setup': ['./drizzle/**/*'],
  },
};

export default nextConfig;
