// Read-only browser verification against a running production build; use a fresh regtest deployment.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = new URL(process.argv[2] || 'http://127.0.0.1:3000').origin;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
try {
  const context = await browser.newContext();
  const network = await context.request.get(origin + '/api/wallet/networks');
  assert.equal((await network.json()).walletNetwork, 'regtest', 'Use a regtest wallet for this smoke test.');
  const page = await context.newPage();
  const violations = [];
  await page.exposeFunction('recordWalletCspViolation', (directive) => violations.push(directive));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (event) => {
    window.recordWalletCspViolation(event.effectiveDirective);
  }));
  const nonces = new Set();
  for (let visit = 0; visit < 2; visit++) {
    const response = await page.goto(origin);
    assert.equal(response.status(), 200);
    const policy = await response.headerValue('Content-Security-Policy');
    const nonce = /(?:^|; )script-src 'nonce-([^']+)'/.exec(policy)?.[1];
    assert.ok(nonce, 'The wallet document must send a script nonce.');
    nonces.add(nonce);
    await page.getByRole('heading', { name: 'Open your wallet' }).waitFor();
    assert.equal(await page.locator('script[nonce]').first().evaluate((script) => script.nonce), nonce);
  }
  assert.equal(nonces.size, 2, 'Separate responses need different nonces.');

  await page.getByRole('button', { name: /Continue with Pubky Ring/ }).click();
  await page.getByRole('link', { name: 'Open Pubky Ring' }).waitFor();
  await page.getByRole('button', { name: 'Cancel' }).click();

  const workerResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/wallet-engine/worker.js');
  await page.getByRole('button', { name: /Use a password/ }).click();
  const worker = await workerResponse;
  assert.equal(worker.status(), 200);
  const workerPolicy = await worker.headerValue('Content-Security-Policy');
  assert.match(workerPolicy, /(?:^|; )default-src 'none'/);
  assert.match(workerPolicy, /(?:^|; )script-src 'wasm-unsafe-eval'/);
  await page.getByLabel('New wallet password').waitFor();
  assert.deepEqual(violations, []);
  console.info('Wallet hydration, per-response nonces, Ring request and encrypted storage inspection passed under CSP.');
} finally {
  await browser.close();
}
