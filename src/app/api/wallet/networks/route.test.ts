import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

describe('wallet network', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('exposes only the networks and keeps unknown values unset', async () => {
    vi.stubEnv('WALLET_NETWORK', 'mainnet');
    vi.stubEnv('WALLET_RELAY_SECRET', 'private');
    let response = GET();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ walletNetwork: 'mainnet' });
    vi.stubEnv('WALLET_NETWORK', 'unknown');
    response = GET();
    expect(await response.json()).toEqual({ walletNetwork: null });
  });
});
