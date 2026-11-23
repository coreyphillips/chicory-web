import type { Session } from '@synonymdev/pubky';
import { create } from 'zustand';

export { LOCAL_ACCOUNT } from '@/libs/wallet/account.mjs';

type Auth = {
  currentUserPubky: string | null;
  session: Session | null;
  generation: string;
  isLoggingOut: boolean;
  needsAccountSync: boolean;
};

export const useAuthStore = create<Auth>(() => ({
  currentUserPubky: null,
  session: null,
  generation: '',
  isLoggingOut: false,
  needsAccountSync: false,
}));
