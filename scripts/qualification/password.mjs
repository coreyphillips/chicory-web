import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';

const origin = new URL(process.env.QUALIFY_WALLET_ORIGIN ?? 'https://localhost:43886');
assert.equal(origin.protocol, 'https:', 'Use the HTTPS regtest wallet.');
const pin = process.env.QUALIFY_TLS_SPKI;
if (pin) assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'Pin only a local test certificate.');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
  args: pin ? ['--ignore-certificate-errors-spki-list=' + pin] : [],
});

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const violations = [];
  await page.exposeFunction('recordViolation', (directive) => violations.push(directive));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (event) => {
    window.recordViolation(event.effectiveDirective);
  }));
  const button = (name) => page.getByRole('button', { name, exact: true });
  await page.goto(origin.origin);
  assert.equal(await page.evaluate(async () => (await (await fetch('/api/wallet/networks')).json()).walletNetwork), 'regtest');
  await page.getByRole('button', { name: /Use a password/ }).click();
  const password = randomBytes(32).toString('base64url');
  await page.getByLabel('New wallet password').fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await button('Continue').click();
  await button('Create with recovery phrase').click();
  await button('I saved my words').click();
  await button('Go to Receive').click();
  await button('Receive on-chain').click();
  await page.locator('dd').filter({ hasText: /^bcrt1[0-9a-z]+$/ }).waitFor();

  const second = await context.newPage();
  await second.goto(origin.origin);
  await second.getByText(/already open|another tab|another wallet session/i).first().waitFor();
  await second.close();
  await page.bringToFront();
  await button('Go to Overview').click();
  await button('Lock').click();
  const field = page.getByLabel('Password', { exact: true });
  await field.fill('incorrect qualification password');
  await button('Unlock wallet').click();
  await page.getByRole('alert').filter({ hasText: /check the password/i }).waitFor();
  for (let visit = 0; visit < 2; visit++) {
    if (visit) await page.reload();
    await field.fill(password);
    await button('Unlock wallet').click();
    await page.getByRole('region', { name: 'Wallet overview' }).waitFor();
  }
  assert.deepEqual(violations, []);
  console.info('Password wallet, regtest address, second-tab exclusion, incorrect password and reopening after reload passed.');
} finally {
  await browser.close();
}
