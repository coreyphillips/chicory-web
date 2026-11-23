import { isIP } from 'node:net';

const minute = 60_000;
const maxSources = 4096;
const maxRelayClients = 256;
export const grantsPerMinute = 30;
export const upgradesPerMinute = 90;
export const socketsPerClient = 16;

// Fixed windows bound both memory and work per request. A full table declines new sources
// until the next window instead of evicting a source that has already spent its quota.
export function requestLimit(maxRequests, clock = Date.now) {
  let windowStart = 0;
  const counts = new Map();
  return (client) => {
    const now = clock();
    if (now - windowStart >= minute) {
      windowStart = now;
      counts.clear();
    }
    const count = counts.get(client) ?? 0;
    if (count >= maxRequests || (count === 0 && counts.size >= maxSources)) {
      return Math.max(1, Math.ceil((windowStart + minute - now) / 1000));
    }
    counts.set(client, count + 1);
    return 0;
  };
}

export function socketLimit(totalLimit = maxRelayClients, clientLimit = socketsPerClient) {
  let total = 0;
  const active = new Map();
  return (client) => {
    const count = active.get(client) ?? 0;
    if (count >= clientLimit || total >= totalLimit) return null;
    total++;
    active.set(client, count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      total--;
      const remaining = active.get(client) - 1;
      if (remaining) active.set(client, remaining);
      else active.delete(client);
    };
  };
}

// Only use the header written by the explicitly configured ingress. Without one,
// the standalone relay uses the socket peer; Next's Fetch API has no socket peer.
export function clientSource(headers, env, remoteAddress = undefined) {
  const read = (name) => typeof headers.get === 'function' ? headers.get(name) : headers[name];
  let address = remoteAddress;
  if (env.VERCEL === '1') address = read('x-vercel-forwarded-for');
  else if (env.WALLET_TRUST_PROXY === '1') address = read('x-chicory-client-ip');
  else if (!remoteAddress) return 'direct';
  if (typeof address !== 'string' || address.includes('%')) return null;
  const version = isIP(address);
  if (version === 4) return address;
  if (version !== 6) return null;

  const normalized = new URL('http://[' + address + ']').hostname.slice(1, -1);
  // Map dual-stack socket addresses back to their IPv4 client.
  const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(normalized);
  if (mapped) {
    const high = parseInt(mapped[1], 16);
    const low = parseInt(mapped[2], 16);
    return [high >> 8, high & 255, low >> 8, low & 255].join('.');
  }
  // Temporary interface addresses from the same IPv6 /64 share one budget.
  const [left, right] = normalized.split('::');
  const start = left ? left.split(':') : [];
  const end = right ? right.split(':') : [];
  const groups = [...start, ...Array(8 - start.length - end.length).fill('0'), ...end];
  return groups.slice(0, 4).join(':') + '::/64';
}
