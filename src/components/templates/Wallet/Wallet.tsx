'use client';

import { LOCAL_ACCOUNT, useAuthStore } from '@/stores/auth/auth.store';
import { WalletSurface } from './WalletTab';

export function Wallet({ recipient }: { recipient?: string }) {
  const account = useAuthStore((state) =>
    state.session || state.currentUserPubky === LOCAL_ACCOUNT ? state.currentUserPubky : null,
  );
  return account ? <WalletSurface account={account} recipient={recipient} /> : null;
}
