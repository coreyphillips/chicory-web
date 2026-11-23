import { clientSource, grantsPerMinute, requestLimit } from '../../../../../scripts/wallet/limits.mjs';
import { issueTicket } from '../../../../../scripts/wallet/tickets.mjs';
import { connectionGrant, connectionSettings } from '../../../../../scripts/wallet/transport.mjs';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'iad1';

const limitGrants = requestLimit(grantsPerMinute);

/** Issue a short-lived transport grant for the fixed operator endpoints. */
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return Response.json({ error: 'Open Chicory in this browser.' }, { status: 403, headers });
  }
  try {
    const settings = connectionSettings(process.env);
    const origin = request.headers.get('origin');
    const hosted = process.env.VERCEL === '1';
    // Next can use its internal HTTP URL behind TLS termination. The proxy forwards
    // the public Host, and the hosted adapter supplies a canonical request URL.
    const requestUrl = new URL(request.url);
    const host = request.headers.get('host') ?? requestUrl.host;
    const client = clientSource(request.headers, process.env);
    if (
      !client ||
      host !== new URL(settings.appOrigin).host ||
      (origin && origin !== settings.appOrigin) ||
      (hosted && requestUrl.origin !== settings.appOrigin)
    ) {
      return Response.json({ error: 'Open Chicory in this browser.' }, { status: 403, headers });
    }
    const retryAfter = limitGrants(client);
    if (retryAfter) {
      return Response.json({ error: 'Too many connection requests. Try again shortly.' }, {
        status: 429, headers: { ...headers, 'Retry-After': String(retryAfter) },
      });
    }
    if (hosted) {
      return Response.json(await issueTicket(settings), { headers });
    }
    return Response.json(connectionGrant(settings), { headers });
  } catch {
    return Response.json({ error: 'The wallet relay has not been configured.' }, { status: 503, headers });
  }
}
