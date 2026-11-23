// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { grantsPerMinute } from '../../../../../scripts/wallet/limits.mjs';
import { GET } from './route';

const origin = 'https://wallet.example';

function grant(headers: Record<string, string>) {
  return GET(new Request(origin + '/api/wallet/connection', { headers }));
}

beforeEach(() => {
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('WALLET_NETWORK', 'regtest');
  vi.stubEnv('WALLET_PRIMARY_URI', '02' + 'ab'.repeat(32) + '@127.0.0.1:9735');
  vi.stubEnv('WALLET_APP_ORIGIN', origin);
  vi.stubEnv('WALLET_RELAY_ORIGIN', 'wss://wallet.example');
  vi.stubEnv('WALLET_RELAY_SECRET', 'ab'.repeat(32));
  vi.stubEnv('WALLET_TRUST_PROXY', '1');
});
afterEach(() => vi.unstubAllEnvs());

it('issues a bounded number of private grants per ingress address', async () => {
  const client = { 'X-Chicory-Client-IP': '192.0.2.10' };
  for (let i = 0; i < grantsPerMinute; i++) expect((await grant(client)).status).toBe(200);
  const limited = await grant(client);
  expect(limited.status).toBe(429);
  expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  expect(limited.headers.get('cache-control')).toContain('no-store');
  expect(await limited.json()).not.toHaveProperty('token');
  expect((await grant({ 'X-Chicory-Client-IP': '192.0.2.20' })).status).toBe(200);
});

it('requires the configured ingress identity and the canonical Host and Origin', async () => {
  expect((await grant({ 'X-Forwarded-For': '192.0.2.11' })).status).toBe(403);
  const source = { 'X-Chicory-Client-IP': '192.0.2.11' };
  expect((await grant({ ...source, Host: 'another.example' })).status).toBe(403);
  expect((await grant({ ...source, Origin: 'https://another.example' })).status).toBe(403);
  expect((await grant({ ...source, Origin: origin })).status).toBe(200);
});
