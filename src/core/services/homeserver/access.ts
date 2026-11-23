import type { Session } from '@synonymdev/pubky';
import { APP_PRIVATE_PATH } from '@/config/app-files';
import { getDefaultHttpRelay } from '@/config/network';
import { LOCAL_ACCOUNT, useAuthStore } from '@/stores/auth/auth.store';

export const selectionKey = 'chicory.wallet.account.v1';
export const walletStorageScope = `${APP_PRIVATE_PATH}wallet/:rw`;
const clientId = () => window.location.host + '/wallet';

function setAccount(account: string | null, session: Session | null = null) {
  const old = useAuthStore.getState().session;
  useAuthStore.setState({
    currentUserPubky: account,
    session,
    generation: crypto.randomUUID(),
    isLoggingOut: false,
    needsAccountSync: false,
  });
  if (old !== session) old?.free();
}

async function browserStore() {
  const { Pubky } = await import('@synonymdev/pubky');
  const sdk = new Pubky();
  try {
    return sdk.browserSessionStore;
  } finally {
    sdk.free();
  }
}

export async function walletIdentity(session: Session) {
  const grant = session.grant;
  if (!grant) throw new Error('A wallet storage grant is required.');
  try {
    const info = await grant.sessionInfo();
    try {
      if (info.clientId !== clientId() || info.capabilities.length !== 1 || info.capabilities[0] !== walletStorageScope) {
        throw new Error('Approve only the requested wallet storage permission in Ring.');
      }
    } finally {
      info.free();
    }
  } finally {
    grant.free();
  }
  const info = session.info;
  try {
    const pk = info.publicKey;
    try {
      return pk.z32();
    } finally {
      pk.free();
    }
  } finally {
    info.free();
  }
}

export async function restoreAccount(signal: AbortSignal) {
  setAccount(null);
  const selection = localStorage.getItem(selectionKey);
  if (!selection) return;
  if (selection === LOCAL_ACCOUNT) {
    setAccount(LOCAL_ACCOUNT);
    return;
  }
  const store = await browserStore();
  let session: Session | undefined;
  try {
    signal.throwIfAborted();
    session = await store.restore(selection);
    const account = await walletIdentity(session);
    signal.throwIfAborted();
    if (localStorage.getItem(selectionKey) !== selection) return;
    setAccount(account, session);
    session = undefined;
  } finally {
    session?.free();
    store.free();
  }
}

export function chooseLocalAccount() {
  localStorage.setItem(selectionKey, LOCAL_ACCOUNT);
  setAccount(LOCAL_ACCOUNT);
}

export async function signInWithRing(signal: AbortSignal, showUrl: (url: string) => void) {
  const { GrantAuthFlow, AuthFlowKind } = await import('@synonymdev/pubky');
  signal.throwIfAborted();
  const flow = await GrantAuthFlow.startDelegated(walletStorageScope, AuthFlowKind.signin(), {
    clientId: clientId(),
    relay: getDefaultHttpRelay(),
  });
  let session: Session | undefined;
  try {
    signal.throwIfAborted();
    showUrl(flow.authorizationUrl);
    const expires = Date.now() + 300_000;
    while (!session) {
      signal.throwIfAborted();
      if (Date.now() >= expires) throw new Error('The Ring approval expired. Start a new request.');
      session = await flow.tryPollOnce();
      if (!session) await new Promise((resolve) => setTimeout(resolve, 350));
    }
    signal.throwIfAborted();
    const account = await walletIdentity(session);
    const store = await browserStore();
    try {
      signal.throwIfAborted();
      const saved = await store.save(session);
      try {
        signal.throwIfAborted();
        localStorage.setItem(selectionKey, saved.id);
        setAccount(account, session);
        session = undefined;
      } catch (error) {
        await store.remove(saved.id);
        throw error;
      } finally {
        saved.free();
      }
    } finally {
      store.free();
    }
  } finally {
    flow.free();
    if (session) {
      // A late approval after cancellation cannot become the selected account.
      try {
        await session.signout();
      } finally {
        session.free();
      }
    }
  }
}

export async function signOut() {
  const { session, isLoggingOut } = useAuthStore.getState();
  if (isLoggingOut) return;
  const selection = localStorage.getItem(selectionKey);
  // Fence the worker before starting any network or persistence operation.
  useAuthStore.setState({ currentUserPubky: null, session: null, isLoggingOut: true, generation: crypto.randomUUID() });
  try {
    localStorage.removeItem(selectionKey);
    if (session) {
      try {
        await session.signout();
      } finally {
        if (selection && selection !== LOCAL_ACCOUNT) {
          const store = await browserStore();
          try {
            await store.remove(selection);
          } finally {
            store.free();
          }
        }
      }
    }
  } finally {
    session?.free();
    useAuthStore.setState({ isLoggingOut: false });
  }
}
