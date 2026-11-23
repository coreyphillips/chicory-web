import type { Network } from '@beignet/wallet-core';

export function walletNetwork(value: unknown): Network | null {
  return value === 'mainnet' || value === 'testnet' || value === 'regtest' ? value : null;
}
