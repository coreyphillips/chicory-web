// Smoke the distributed bytes with a fresh process, separate from the source checkout.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const archive = resolve(process.argv[2] || 'chicory-web-linux-x64.tar.gz');
const directory = await mkdtemp(join(tmpdir(), 'chicory-release-'));
const children = [];

async function freePort() {
  const probe = createServer();
  await new Promise((done, fail) => probe.once('error', fail).listen(0, '127.0.0.1', done));
  const { port } = probe.address();
  await new Promise((done) => probe.close(done));
  return port;
}

async function waitForResponse(child, url) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null || child.signalCode) throw new Error('Packaged service exited during startup.');
    try {
      return await fetch(url, { signal: AbortSignal.timeout(1000) });
    } catch {
      await delay(100);
    }
  }
  throw new Error('Packaged service did not start on loopback.');
}

try {
  execFileSync('tar', ['-xzf', archive, '-C', directory]);
  // The primary connects through this native module when its advertised address uses Iroh.
  execFileSync(process.execPath, ['--input-type=module', '-e', "await import('@number0/iroh/index.js');"], { cwd: directory });
  const appPort = await freePort();
  let relayPort = await freePort();
  while (relayPort === appPort) relayPort = await freePort();
  const origin = 'http://127.0.0.1:' + appPort;
  const env = {
    PATH: process.env.PATH,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    HOSTNAME: '127.0.0.1',
    PORT: String(appPort),
    WALLET_RELAY_PORT: String(relayPort),
    WALLET_NETWORK: 'regtest',
    WALLET_APP_ORIGIN: origin,
    WALLET_RELAY_ORIGIN: 'ws://127.0.0.1:' + relayPort,
    WALLET_RELAY_SECRET: randomBytes(32).toString('hex'),
    WALLET_PRIMARY_URI: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798@127.0.0.1:9735',
    WALLET_ELECTRUM: 'tcp://127.0.0.1:60001',
  };
  const start = (file) => {
    const child = spawn(process.execPath, [file], { cwd: directory, stdio: 'inherit', env });
    children.push(child);
    return child;
  };
  const app = start('server.js');
  const relay = start('scripts/wallet/relay.mjs');
  assert.equal((await waitForResponse(relay, 'http://127.0.0.1:' + relayPort)).status, 404);
  const page = await waitForResponse(app, origin);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Chicory/i);
  const grant = await fetch(origin + '/api/wallet/connection');
  assert.equal(grant.status, 200);
  const connection = await grant.json();
  assert.equal(connection.network, 'regtest');
  assert.equal(connection.peerUrl, env.WALLET_RELAY_ORIGIN + '/peer');
  for (const path of ['/wallet-engine/worker.js', '/wallet-engine/sql-wasm.wasm', '/brand/icon-180.png']) {
    assert.equal((await fetch(origin + path, { method: 'HEAD' })).status, 200, path);
  }
  console.log('Packaged app, relay, regtest grant, native Iroh and wallet assets verified.');
} finally {
  await Promise.all(children.map(async (child) => {
    if (child.exitCode !== null || child.signalCode) return;
    const exited = new Promise((done) => child.once('exit', done));
    child.kill('SIGTERM');
    await exited;
  }));
  await rm(directory, { recursive: true, force: true });
}
