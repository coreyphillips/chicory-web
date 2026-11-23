// Run against a local HTTPS regtest wallet and pubky-testnet 0.17.1.
// The signer and both wallets run in separate temporary Chromium profiles.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const origin = new URL(process.env.QUALIFY_WALLET_ORIGIN ?? 'https://localhost:43886').origin;
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
assert.ok(origin.startsWith('https://') && localHosts.has(new URL(origin).hostname), 'Use a loopback HTTPS wallet.');
const serverKey = process.env.QUALIFY_HOMESERVER;
assert.match(serverKey ?? '', /^[ybndrfg8ejkmcpqxot1uwisza345h769]{51}[yo]$/, 'Supply the public key of the disposable local homeserver.');
const approvalRelay = new URL(process.env.QUALIFY_APPROVAL_RELAY ?? 'https://httprelay.pubky.app/inbox');
const storageScope = '/priv/app.pubky/v1/wallet/:rw';
const spendingScope = '/priv/pubky-wallet/v1/regtest/wallet-key:e';
const unlockScope = /^\/priv\/pubky-wallet\/v1\/regtest\/devices\/[a-f0-9-]{36}\/unlock:e$/;
const pin = process.env.QUALIFY_TLS_SPKI;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
  args: pin ? ['--ignore-certificate-errors-spki-list=' + pin] : [],
});
let stage = 'initial checks';
const clients = [];
const diagnostics = new Set();
const policyViolations = new Set();
const step = (name) => { stage = name; console.info(name); };
const button = (page, name) => page.getByRole('button', { name, exact: typeof name === 'string' });

async function makeSigner() {
  // The app never loads this bundle. Only this page holds the throwaway signing identity.
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), contents: `
      import { Pubky, PublicKey, Keypair } from '@synonymdev/pubky';
      import jsQR from 'jsqr';
      const sdk = Pubky.testnet('localhost');
      const signer = sdk.signer(Keypair.random());
      window.signup = async (key) => {
        const server = PublicKey.from(key);
        try { await signer.signup(server); } catch (error) {
          if (!/publish/i.test(error?.message ?? '')) throw error;
          await signer.pkdns.publishHomeserverIfStale(server);
        } finally { server.free(); }
      };
      window.approve = (link) => signer.approveAuthRequest(link);
      window.decode = async (png) => {
        const image = await createImageBitmap(await (await fetch('data:image/png;base64,' + png)).blob());
        const canvas = new OffscreenCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        image.close();
        const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return jsQR(rgba.data, rgba.width, rgba.height)?.data;
      };
    ` },
    platform: 'browser', format: 'esm', bundle: true, write: false,
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const signerOrigin = 'http://localhost:44189';
  await context.grantPermissions(['local-network-access'], { origin: signerOrigin });
  await context.route(signerOrigin + '/**', (route) => {
    const bundleRequest = new URL(route.request().url()).pathname === '/signer.js';
    return route.fulfill(bundleRequest
      ? { contentType: 'application/javascript', body: Buffer.from(bundle.outputFiles[0].contents) }
      : { contentType: 'text/html', body: '<script type="module" src="/signer.js"></script>' });
  });
  page.on('requestfailed', (req) => {
    if (req.failure()?.errorText !== 'net::ERR_ABORTED') diagnostics.add('Signer request failed: ' + new URL(req.url()).origin);
  });
  await page.goto(signerOrigin);
  await page.waitForFunction(() => typeof window.signup === 'function', undefined, { timeout: 10_000 });
  await page.evaluate(async (key) => {
    try { await window.signup(key); } catch (error) {
      throw new Error('Local signup failed: ' + (error?.name ?? 'SDK error') + ' ' + (error?.data?.statusCode ?? '') + ' ' + String(error?.message ?? '').replace(/https?:\/\/\S+/g, '[endpoint]').replace(/[a-zA-Z0-9_-]{40,}/g, '[id]').slice(0, 100));
    }
  }, serverKey);
  return page;
}

async function makeWallet() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 920 }, deviceScaleFactor: 3 });
  await context.grantPermissions(['local-network-access'], { origin });
  // Resolve only signed records from the test network. The unmodified SDK verifies
  // signatures and connects to the actual homeserver. No wallet or SDK method is replaced.
  await context.route(/^https:\/\/pkarr\.pubky\.(app|org)\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET' || !/^\/[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/.test(path)) return route.abort();
    const response = await route.fetch({ url: 'http://localhost:15411' + path });
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
  });
  const page = await context.newPage();
  clients.push(page);
  await page.exposeFunction('reportQualificationViolation', (directive) => policyViolations.add(directive));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (event) => {
    window.reportQualificationViolation(event.effectiveDirective);
  }));
  page.setDefaultTimeout(55_000);
  page.on('requestfailed', (request) => {
    const { origin: failedOrigin } = new URL(request.url());
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') diagnostics.add('Failed request to ' + failedOrigin);
  });
  const network = await page.goto(origin + '/api/wallet/networks');
  assert.equal((await network.json()).walletNetwork, 'regtest', 'This test requires Bitcoin regtest.');
  const response = await page.goto(origin);
  assert.ok((await response.headerValue('content-security-policy'))?.includes("'strict-dynamic'"), 'Use a production build with the wallet CSP.');
  return page;
}

async function approve(page, signer, scope, title) {
  // Decode the same QR presented to a person. Keep the link, grant and image in memory.
  const svg = page.locator('svg').filter({ has: page.locator('title', { hasText: title }) });
  const png = await svg.screenshot({ scale: 'device' });
  const link = await signer.evaluate((encoded) => window.decode(encoded), png.toString('base64'));
  assert.ok(link, 'Could not decode the Ring approval QR.');
  const parsed = new URL(link);
  assert.equal(parsed.protocol, 'pubkyauth:');
  assert.equal(parsed.host, 'signin_grant');
  const scopes = parsed.searchParams.get('caps');
  if (typeof scope === 'string') assert.equal(scopes, scope);
  else assert.match(scopes, scope);
  assert.equal(parsed.searchParams.get('cid'), new URL(origin).host + '/wallet');
  const relay = new URL(parsed.searchParams.get('relay'));
  assert.equal(relay.origin, approvalRelay.origin);
  assert.equal(relay.pathname.replace(/\/$/, ''), approvalRelay.pathname.replace(/\/$/, ''));
  if (scope !== storageScope) assert.equal(parsed.searchParams.get('af'), 'v1');
  // Surface a fixed message on failure so a transport error cannot print a grant URI.
  await signer.evaluate(async (url) => {
    try { await window.approve(url); } catch (error) {
      throw new Error('The local SDK signer could not approve. ' + (error?.data?.statusCode ?? error?.name ?? ''));
    }
  }, link);
  return scopes;
}

async function enterIdentity(page, signer) {
  await button(page, /Continue with Pubky Ring/).click();
  await approve(page, signer, storageScope, 'Pubky Ring sign-in request');
  await button(page, 'Set up with Ring').click();
  return approve(page, signer, unlockScope, 'Scan with Pubky Ring');
}

async function walletAddress(page) {
  await button(page, 'Go to Receive').click();
  const worker = page.workers().find((candidate) => new URL(candidate.url()).pathname === '/wallet-engine/worker.js');
  assert.ok(worker, 'The live browser wallet worker is required.');
  // Observe only the public record ID that the genuine UI selects. Keep secrets and RPC payloads out of test output.
  await worker.evaluate(() => {
    self.qualifiedWalletId = undefined;
    self.addEventListener('message', function observe(event) {
      const { operation, payload } = event.data ?? {};
      if (operation !== 'request' || payload?.method !== 'POST') return;
      const id = /^\/wallets\/([0-9a-f]{32})\/api\/address\/new$/.exec(payload.path)?.[1];
      if (id) { self.qualifiedWalletId = id; self.removeEventListener('message', observe); }
    });
  });
  await button(page, 'Receive on-chain').click();
  const address = page.locator('dd').filter({ hasText: /^bcrt1[0-9a-z]+$/ });
  await address.waitFor();
  const id = await worker.evaluate(() => self.qualifiedWalletId);
  assert.match(id ?? '', /^[0-9a-f]{32}$/);
  return { id, address: (await address.textContent()).trim() };
}

try {
  step('Registering a disposable local signer');
  const signer = await makeSigner();
  const a = await makeWallet();
  const b = await makeWallet();
  step('Connecting source identity and enrolling its device unlock');
  await a.bringToFront();
  const sourceScope = await enterIdentity(a, signer);
  step('Creating the source Ring wallet');
  await a.getByRole('checkbox', { name: /first Ring wallet on Bitcoin regtest/ }).check();
  await button(a, 'Create with Ring').click();
  await approve(a, signer, spendingScope, 'Scan with Pubky Ring');
  const source = await walletAddress(a);
  step('Restoring the sign-in after reload and approving a fresh source unlock');
  await a.reload();
  await button(a, 'Unlock with Ring').click();
  assert.equal(await approve(a, signer, unlockScope, 'Scan with Pubky Ring'), sourceScope);
  // A reload can interrupt the old tab before it releases its 90-second homeserver lease.
  await a.getByRole('region', { name: 'Wallet overview' }).waitFor({ timeout: 150_000 });

  step('Connecting destination and confirming the source owns the wallet');
  await b.bringToFront();
  const destinationScope = await enterIdentity(b, signer);
  assert.notEqual(destinationScope, sourceScope, 'Each browser must have its own Ring unlock scope.');
  await b.getByRole('heading', { name: 'Your wallet is on another device' }).waitFor();

  step('Preparing the encrypted handoff in the source wallet');
  await a.bringToFront();
  await button(a, 'Go to Settings').click();
  await button(a, 'Move to another device').click();
  await approve(a, signer, spendingScope, 'Scan with Pubky Ring');
  await a.getByRole('heading', { name: 'Ready on your other device' }).waitFor();

  step('Claiming the encrypted handoff in the destination wallet');
  await b.bringToFront();
  if (await button(b, 'Check for transfer').isVisible()) await button(b, 'Check for transfer').click();
  await button(b, 'Use wallet on this device').click();
  await approve(b, signer, spendingScope, 'Scan with Pubky Ring');
  await b.getByRole('heading', { name: 'Wallet moved to this device' }).waitFor();
  await b.reload();
  await button(b, 'Unlock with Ring').click();
  assert.equal(await approve(b, signer, unlockScope, 'Scan with Pubky Ring'), destinationScope);
  const destination = await walletAddress(b);
  assert.equal(destination.id, source.id, 'The original wallet record must arrive on the new device.');
  assert.notEqual(destination.address, source.address, 'The restored wallet must advance its receive address index.');

  step('Checking the former owner after destination lock');
  await button(b, 'Go to Overview').click();
  await button(b, 'Lock').click();
  await button(b, 'Unlock with Ring').waitFor();
  await a.reload();
  await button(a, 'Unlock with Ring').click();
  assert.equal(await approve(a, signer, unlockScope, 'Scan with Pubky Ring'), sourceScope);
  await a.getByRole('heading', { name: 'Your wallet is on another device' }).waitFor();
  assert.equal(await a.getByRole('region', { name: 'Wallet overview' }).count(), 0);
  assert.deepEqual([...policyViolations], [], 'The deployed CSP must permit the complete wallet flow.');
  console.info('Two-profile Ring sign-in, reload, unlock, encrypted handoff, wallet continuity and former owner exclusion passed.');
} catch (error) {
  // Browser error strings may contain secret URLs. Print only public UI state and normalized diagnostics.
  for (const page of clients) {
    const headings = await page.getByRole('heading').allTextContents().catch(() => []);
    console.error('Wallet headings:', headings.join(', '));
    const alerts = await page.getByRole('alert').allTextContents().catch(() => []);
    console.error('Wallet alerts:', alerts.filter((s) => s && s.length < 250 && !s.includes('://')).join(', '));
  }
  console.error([...diagnostics].join('\n'));
  if (policyViolations.size) console.error('Blocked CSP directives:', ...policyViolations);
  console.error('Qualification stopped at ' + stage + ' (' + error.name + ').');
  const detail = String(error.message).split('\n')[0];
  if (detail.length < 220 && !/[:?]\/\/|[a-zA-Z0-9_-]{42,}/.test(detail)) console.error(detail);
  if (error instanceof assert.AssertionError) console.error(error.operator);
  process.exitCode = 1;
} finally {
  await browser.close();
}
