import type { NextConfig } from 'next';

const config: NextConfig = {
  agentRules: false,
  output: 'standalone',
  serverExternalPackages: ['ws', '@number0/iroh', '@number0/iroh-linux-x64-gnu', '@number0/iroh-linux-arm64-gnu', '@synonymdev/pubky'],
  outputFileTracingIncludes: { '/peer': ['./node_modules/@number0/iroh*/**/*'] },
  async redirects() {
    return [{ source: '/wallet', destination: '/', permanent: false }];
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Content-Security-Policy', value: process.env.NODE_ENV === 'development'
        ? "frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
        : "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" },
    ] }];
  },
};
export default config;
