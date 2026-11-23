import assert from 'node:assert/strict';
import test from 'node:test';
import { clientSource, requestLimit, socketLimit } from './limits.mjs';

test('request budgets expire, keep independent clients and bound the number of stored addresses', () => {
  let now = 60_000;
  const limit = requestLimit(2, () => now);
  assert.equal(limit('first'), 0);
  assert.equal(limit('first'), 0);
  assert.equal(limit('first'), 60);
  for (let id = 1; id < 4096; id++) assert.equal(limit(String(id)), 0);
  assert.equal(limit('next'), 60);
  now += 59_500;
  assert.equal(limit('first'), 1);
  now += 500;
  assert.equal(limit('first'), 0);
  assert.equal(limit('next'), 0);
});

test('socket slots honor both ceilings and release once on failure or close', () => {
  const reserve = socketLimit(2, 1);
  const first = reserve('first');
  assert.equal(reserve('first'), null);
  const second = reserve('second');
  assert.equal(reserve('third'), null);
  first();
  first();
  const third = reserve('third');
  assert.equal(reserve('fourth'), null);
  second();
  third();
  assert.equal(typeof reserve('second'), 'function');
});

test('client identity comes from the chosen ingress and accepts one canonical IP address', () => {
  const headers = new Headers({
    'X-Chicory-Client-IP': '192.0.2.1',
    'X-Vercel-Forwarded-For': '192.0.2.2',
    'X-Forwarded-For': '192.0.2.3',
  });
  assert.equal(clientSource(headers, {}, '127.0.0.1'), '127.0.0.1');
  assert.equal(clientSource(headers, {}), 'direct');
  assert.equal(clientSource(headers, { VERCEL: '1', WALLET_TRUST_PROXY: '1' }), '192.0.2.2');
  assert.equal(clientSource(headers, { WALLET_TRUST_PROXY: '1' }), '192.0.2.1');
  headers.delete('X-Vercel-Forwarded-For');
  assert.equal(clientSource(headers, { VERCEL: '1' }), null);
  const env = { WALLET_TRUST_PROXY: '1' };
  for (const address of ['2001:0db8:0:0::0001', '2001:db8::cafe:2', '2001:db8:0:0:1:2:3:4']) {
    assert.equal(clientSource({ 'x-chicory-client-ip': address }, env), '2001:db8:0:0::/64');
  }
  assert.equal(clientSource({ 'x-chicory-client-ip': '::ffff:192.0.2.1' }, env), '192.0.2.1');
  for (const bad of [undefined, ['192.0.2.1'], 'peer.example', 'fe80::1%wlan0', '192.0.2.1, 192.0.2.3']) {
    assert.equal(clientSource({ 'x-chicory-client-ip': bad }, env), null);
  }
});
