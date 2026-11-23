import type { Session } from '@synonymdev/pubky';
import { beforeEach, expect, it, vi } from 'vitest';
import { LOCAL_ACCOUNT, useAuthStore } from '@/stores/auth/auth.store';
import { asOpaque } from '@/test-utils/type-assertions';
import { chooseLocalAccount, restoreAccount, selectionKey, signInWithRing, signOut, walletStorageScope } from './access';

const sdk = vi.hoisted(() => ({
  start: vi.fn(),
  poll: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@synonymdev/pubky', () => ({
  Pubky: class {
    browserSessionStore = { save: sdk.save, restore: sdk.restore, remove: sdk.remove, free() {} };
    free() {}
  },
  GrantAuthFlow: { startDelegated: sdk.start },
  AuthFlowKind: { signin: () => 'signin' },
}));

const account = 'y'.repeat(52);
function approved(capabilities = [walletStorageScope], host = location.host) {
  return {
    info: { publicKey: { z32: () => account, free() {} }, free() {} },
    grant: {
      sessionInfo: async () => ({ clientId: host + '/wallet', capabilities, free() {} }),
      free() {},
    },
    signout: vi.fn(async () => {}),
    free: vi.fn(),
  };
}

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ session: null, currentUserPubky: null, isLoggingOut: false, needsAccountSync: false });
  vi.resetAllMocks();
  sdk.start.mockResolvedValue({ authorizationUrl: 'pubkyauth://signin_grant', tryPollOnce: sdk.poll, free() {} });
  sdk.save.mockResolvedValue({ id: 'sdk-record-id', free() {} });
});

it('opens and restores the local namespace without a signer or server session', async () => {
  chooseLocalAccount();
  useAuthStore.setState({ currentUserPubky: null });
  await restoreAccount(new AbortController().signal);
  expect(useAuthStore.getState()).toMatchObject({ currentUserPubky: LOCAL_ACCOUNT, session: null });
  expect(sdk.start).not.toHaveBeenCalled();
  expect(sdk.restore).not.toHaveBeenCalled();
  await signOut();
  expect(useAuthStore.getState().currentUserPubky).toBeNull();
  expect(localStorage.getItem(selectionKey)).toBeNull();
});

it('saves only the SDK session reference, restores the identity and fences before revocation', async () => {
  const session = approved();
  const restored = approved();
  sdk.poll.mockResolvedValue(session);
  const showUrl = vi.fn();
  await signInWithRing(new AbortController().signal, showUrl);
  expect(sdk.start).toHaveBeenCalledWith('/priv/app.pubky/v1/wallet/:rw', 'signin', expect.objectContaining({ clientId: location.host + '/wallet' }));
  expect(showUrl).toHaveBeenCalledWith('pubkyauth://signin_grant');
  expect(sdk.save).toHaveBeenCalledWith(session);
  expect(localStorage.getItem(selectionKey)).toBe('sdk-record-id');
  sdk.restore.mockResolvedValue(restored);
  await restoreAccount(new AbortController().signal);
  expect(sdk.restore).toHaveBeenCalledWith('sdk-record-id');
  expect(useAuthStore.getState()).toMatchObject({ session: restored, currentUserPubky: account });
  restored.signout.mockImplementation(async () => {
    expect(useAuthStore.getState()).toMatchObject({ currentUserPubky: null, session: null, isLoggingOut: true });
  });
  await signOut();
  expect(restored.signout).toHaveBeenCalledTimes(1);
  expect(sdk.remove).toHaveBeenCalledWith('sdk-record-id');
});

it.each([
  [() => approved(['/:rw'])],
  [() => approved([walletStorageScope, '/priv/pubky-wallet/v1/mainnet/wallet-key:e'])],
  [() => approved([walletStorageScope], 'another-app.example')],
])('rejects widened scopes and approvals for another client', async (makeSession) => {
  const session = makeSession();
  sdk.poll.mockResolvedValue(session);
  await expect(signInWithRing(new AbortController().signal, vi.fn())).rejects.toThrow('requested wallet storage');
  expect(sdk.save).not.toHaveBeenCalled();
  expect(session.signout).toHaveBeenCalled();
  expect(useAuthStore.getState().session).toBeNull();
});

it('revokes a late sign-in approval after the user cancels', async () => {
  const controller = new AbortController();
  const session = approved();
  sdk.poll.mockImplementation(async () => {
    controller.abort();
    return asOpaque<Session>(session);
  });
  await expect(signInWithRing(controller.signal, vi.fn())).rejects.toThrow();
  expect(session.signout).toHaveBeenCalledOnce();
  expect(sdk.save).not.toHaveBeenCalled();
});

it('discards a restored session after another tab selects a different account', async () => {
  localStorage.setItem(selectionKey, 'sdk-record-id');
  const stale = approved();
  sdk.restore.mockImplementation(async () => {
    chooseLocalAccount();
    return stale;
  });
  await restoreAccount(new AbortController().signal);
  expect(useAuthStore.getState()).toMatchObject({ currentUserPubky: LOCAL_ACCOUNT, session: null });
  expect(stale.free).toHaveBeenCalled();
  expect(stale.signout).not.toHaveBeenCalled();
});
