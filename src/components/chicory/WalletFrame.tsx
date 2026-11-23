import type { ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, Clock3, Settings, Wallet, Monitor } from 'lucide-react';
import { Wordmark } from './AccessShell';

const views = [
  { id: 'overview', name: 'Overview', icon: Wallet },
  { id: 'send', name: 'Send', icon: ArrowUpRight },
  { id: 'receive', name: 'Receive', icon: ArrowDownLeft },
  { id: 'activity', name: 'Activity', icon: Clock3 },
  { id: 'backup', name: 'Settings', icon: Settings },
] as const;

export type WalletView = (typeof views)[number]['id'];

export function WalletFrame({
  view,
  network,
  connected,
  busy,
  paymentBlocked,
  backupBlocked,
  navigate,
  children,
}: {
  view: WalletView;
  network: string;
  connected: boolean;
  busy: boolean;
  paymentBlocked: boolean;
  backupBlocked: boolean;
  navigate: (view: WalletView) => void;
  children: ReactNode;
}) {
  return (
    <div className="chicory-frame" data-view={view} data-test-network={network !== 'mainnet'}>
      <a href="#wallet-workspace" className="skip-to-wallet">
        Skip to wallet
      </a>
      <aside className="wallet-rail">
        <Wordmark />
        <nav aria-label="Wallet navigation">
          {views.map(({ id, name, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-label={`Go to ${name}`}
              title={name}
              disabled={
                busy || (paymentBlocked && (id === 'send' || id === 'receive')) || (backupBlocked && id === 'backup')
              }
              aria-current={id === view ? 'page' : undefined}
              onClick={() => navigate(id)}
            >
              <Icon aria-hidden size={19} strokeWidth={1.65} />
              <span>{name}</span>
            </button>
          ))}
        </nav>
        <div className="rail-footer">
          <span className="rail-network" aria-label={`Bitcoin network: ${network}`}>
            <i data-connected={connected} />
            {network}
          </span>
          <span>
            <Monitor size={14} aria-hidden /> On this browser
          </span>
        </div>
      </aside>
      <main id="wallet-workspace" tabIndex={-1} className="wallet-workspace">
        {view !== 'overview' && (
          <div className="compact-session">
            <Wordmark />
            <span aria-label={`Bitcoin network: ${network}`}>{network}</span>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
