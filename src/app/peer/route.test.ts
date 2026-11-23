// @vitest-environment node
import { EventEmitter } from 'node:events';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { socketsPerClient, upgradesPerMinute } from '../../../scripts/wallet/limits.mjs';
import { GET } from './route';

const mocks = vi.hoisted(() => ({ validTicket: vi.fn(), upgrade: vi.fn(), bridge: vi.fn() }));
vi.mock('@vercel/functions', () => ({ upgradeWebSocket: mocks.upgrade }));
vi.mock('../../../scripts/wallet/tickets.mjs', () => ({ validTicket: mocks.validTicket }));
vi.mock('../../../scripts/wallet/bridge.mjs', async (load) => ({
  ...await load<object>(), bridgeSocket: mocks.bridge,
}));

beforeEach(() => {
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_URL', 'test-deployment.example');
  vi.stubEnv('WALLET_NETWORK', 'regtest');
  vi.stubEnv('WALLET_PRIMARY_URI', '02' + 'ab'.repeat(32) + '@127.0.0.1:9735');
  vi.stubEnv('WALLET_ELECTRUM', 'tcp://127.0.0.1:60001');
  vi.stubEnv('WALLET_APP_ORIGIN', 'https://wallet.example');
  vi.stubEnv('WALLET_RELAY_ORIGIN', 'wss://wallet.example');
  mocks.validTicket.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

function request(ip: string) {
  return new Request('https://wallet.example/peer', { headers: {
    Upgrade: 'websocket',
    Origin: 'https://wallet.example',
    'Sec-WebSocket-Protocol': 'beignet.v1, auth.test',
    'X-Vercel-Forwarded-For': ip,
  } });
}

it('limits invalid ticket checks before issuing shared-cache reads', async () => {
  mocks.validTicket.mockResolvedValue(false);
  for (let i = 0; i < upgradesPerMinute; i++) expect((await GET(request('192.0.2.40'))).status).toBe(403);
  const response = await GET(request('192.0.2.40'));
  expect(response.status).toBe(429);
  expect(mocks.validTicket).toHaveBeenCalledTimes(upgradesPerMinute);
  expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
});

it('releases function slots on a failed upgrade and after an active socket closes', async () => {
  const sockets: EventEmitter[] = [];
  mocks.upgrade.mockRejectedValueOnce(new Error('client disconnected'));
  mocks.upgrade.mockImplementation(async (handle: (socket: EventEmitter) => void) => {
    const ws = new EventEmitter();
    sockets.push(ws);
    handle(ws);
    return new Response(null, { status: 204 });
  });
  const open = () => GET(request('192.0.2.41'));
  try {
    expect((await open()).status).toBe(503);
    for (let i = 0; i < socketsPerClient; i++) expect((await open()).status).toBe(204);
    expect((await open()).status).toBe(429);
    sockets[0].emit('close');
    expect((await open()).status).toBe(204);
  } finally {
    for (const ws of sockets) ws.emit('close');
  }
});
