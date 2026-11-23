import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { walletPagePolicy, walletWorkerPolicy } from './config/content-security-policy';
import { getDefaultHttpRelay } from './config/network';

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === 'development') return NextResponse.next();

  if (request.nextUrl.pathname === '/wallet-engine/worker.js') {
    const response = NextResponse.next();
    response.headers.set('Content-Security-Policy', walletWorkerPolicy(process.env.WALLET_RELAY_ORIGIN));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  const policy = walletPagePolicy(
    randomBytes(18).toString('base64'),
    getDefaultHttpRelay(),
    process.env.WALLET_PUBKY_CONNECT_ORIGINS,
  );
  const headers = new Headers(request.headers);
  // Next reads the request policy before rendering and nonces its scripts during SSR.
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static/|_next/image/|brand/|wallet-engine/|api/|peer$|electrum$).*)',
    '/wallet-engine/worker.js',
  ],
};
