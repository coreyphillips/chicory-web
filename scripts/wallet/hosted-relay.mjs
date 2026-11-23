import { upgradeWebSocket } from '@vercel/functions';
import { bridgeSocket, maxRelayPayload, relayToken } from './bridge.mjs';
import { clientSource, requestLimit, socketLimit, upgradesPerMinute } from './limits.mjs';
import { validTicket } from './tickets.mjs';
import { connectionSettings } from './transport.mjs';

const limitAttempts = requestLimit(upgradesPerMinute);
const reserve = socketLimit();

export async function upgradeRelay(request, channel) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const reject = (status) => new Response(null, { status, headers });
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return reject(426);
  const url = new URL(request.url);
  if (url.search) return reject(403);
  if (process.env.VERCEL !== '1') return reject(503);
  const client = clientSource(request.headers, process.env);
  if (!client) return reject(403);
  const retryAfter = limitAttempts(client);
  if (retryAfter) return new Response(null, { status: 429, headers: { ...headers, 'Retry-After': String(retryAfter) } });
  let target;
  try {
    const settings = connectionSettings(process.env);
    const token = relayToken(settings, request.headers.get('origin'), request.headers.get('sec-websocket-protocol'));
    if (url.host !== new URL(settings.relayOrigin).host || !token || !(await validTicket(settings, token))) {
      return reject(403);
    }
    if (channel === 'electrum') target = settings.electrumTarget;
    else if (channel === 'peer') target = settings.peerTarget;
    else return reject(404);
  } catch {
    return reject(503);
  }
  const release = reserve(client);
  if (!release) return new Response(null, { status: 429, headers: { ...headers, 'Retry-After': '1' } });
  try {
    return await upgradeWebSocket(
      (ws) => {
        ws.once('close', release);
        bridgeSocket(ws, target);
      },
      { maxPayload: maxRelayPayload },
    );
  } catch {
    release();
    return reject(503);
  }
}
