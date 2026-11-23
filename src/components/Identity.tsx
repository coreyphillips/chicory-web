'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ChevronRight, KeyRound, LogOut, ScanLine, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { AccessShell } from '@/components/chicory/AccessShell';
import { toAndroidAuthIntentUrl } from '@/libs/deeplink/deeplink';
import { isAndroidIntentDevice } from '@/libs/pwa/platform';
import { chooseLocalAccount, restoreAccount, selectionKey, signInWithRing, signOut } from '@/services/homeserver/access';
import { useAuthStore } from '@/stores/auth/auth.store';
import styles from './identity.module.css';

type Screen = 'restore' | 'choose' | 'approve';
const signOutFailure = 'chicory:sign-out-failure';

export function SignOutButton() {
  return (
    <button type="button" className={styles.signOut} onClick={() => {
      void signOut().catch(() => window.dispatchEvent(new Event(signOutFailure)));
    }}>
      <LogOut size={17} aria-hidden /> Switch account
    </button>
  );
}

export function Identity({ children }: { children: ReactNode }) {
  const account = useAuthStore((state) => state.currentUserPubky);
  const signingOut = useAuthStore((state) => state.isLoggingOut);
  const [screen, setScreen] = useState<Screen>('restore');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [canRetryRestore, setCanRetryRestore] = useState(false);
  const [retry, setRetry] = useState(0);
  const current = useRef<AbortController | null>(null);

  useEffect(() => {
    const restore = () => {
      current.current?.abort();
      const controller = new AbortController();
      current.current = controller;
      setScreen('restore');
      setError('');
      setUrl('');
      setCanRetryRestore(false);
      void restoreAccount(controller.signal).catch(() => {
        if (!controller.signal.aborted) {
          setCanRetryRestore(true);
          setError('Could not restore your Pubky sign-in. Retry or sign in again with the same identity.');
        }
      }).finally(() => {
        if (!controller.signal.aborted) setScreen('choose');
      });
    };
    const changed = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === selectionKey || event.key === null)) restore();
    };
    const reportSignOut = () => setError('This wallet is locked. Check active app permissions in Ring to confirm sign-out.');
    restore();
    window.addEventListener('storage', changed);
    window.addEventListener(signOutFailure, reportSignOut);
    return () => {
      current.current?.abort();
      window.removeEventListener('storage', changed);
      window.removeEventListener(signOutFailure, reportSignOut);
    };
  }, [retry]);

  const cancel = () => {
    current.current?.abort();
    setUrl('');
    setError('');
    setScreen('choose');
  };

  function requestRing() {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    setError('');
    setCanRetryRestore(false);
    setUrl('');
    setScreen('approve');
    void signInWithRing(controller.signal, setUrl).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error && cause.message.startsWith('The Ring approval expired')
        ? cause.message
        : 'Could not complete sign-in. Check your connection and approve the wallet storage request in Pubky Ring.');
    }).finally(() => {
      if (!controller.signal.aborted) {
        setUrl('');
        setScreen('choose');
      }
    });
  }

  if (account && !signingOut) return children;
  if (screen === 'restore' || signingOut) return (
    <AccessShell title="Opening your wallet" description="Checking this browser for your account.">
      <p role="status" className={styles.status}>One moment…</p>
    </AccessShell>
  );
  if (screen === 'approve') return (
    <AccessShell title="Connect Pubky Ring" description="Scan with Ring or open it on this device to approve access to your private wallet files.">
      <div className={styles.approval}>
        {url ? (
          <>
            <div className={styles.qr}><QRCodeSVG value={url} size={234} level="M" marginSize={4} title="Pubky Ring sign-in request" /></div>
            <a className={styles.primary} href={isAndroidIntentDevice() ? toAndroidAuthIntentUrl(url, 'ring') : url}>Open Pubky Ring</a>
          </>
        ) : <p role="status" className={styles.status}>Preparing your request…</p>}
        <button type="button" className={styles.secondary} onClick={cancel}>Cancel</button>
      </div>
    </AccessShell>
  );
  return (
    <AccessShell title="Open your wallet" description="Choose how you want to access Chicory in this browser.">
      <div className={styles.choices}>
        {error && <p role="alert" className={styles.notice}>{error}</p>}
        {canRetryRestore && <button type="button" className={styles.secondary} onClick={() => setRetry((value) => value + 1)}>Retry saved sign-in</button>}
        <button type="button" className={styles.choice} onClick={requestRing}>
          <span className={styles.icon}><ScanLine size={23} aria-hidden /></span>
          <span><strong>Continue with Pubky Ring</strong><small>Use Ring or a password to unlock. Link your wallet to Ring to move it between devices.</small></span>
          <ChevronRight className={styles.chevron} size={18} aria-hidden />
        </button>
        <button type="button" className={styles.choice} onClick={() => {
          cancel();
          try { chooseLocalAccount(); } catch { setError('Allow browser storage to use a local wallet.'); }
        }}>
          <span className={styles.icon}><KeyRound size={22} aria-hidden /></span>
          <span><strong>Use a password</strong><small>Open an independent wallet in this browser. Back it up with recovery words.</small></span>
          <ChevronRight className={styles.chevron} size={18} aria-hidden />
        </button>
        <p className={styles.footnote}><ShieldCheck size={16} aria-hidden /> Your wallet is encrypted in this browser.</p>
      </div>
    </AccessShell>
  );
}

export default Identity;
