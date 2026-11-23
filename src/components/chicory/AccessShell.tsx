import type { ReactNode } from 'react';
import { Fingerprint, Monitor, Zap } from 'lucide-react';

export function Bloom({ className = '' }: { className?: string }) {
  return <span className={`chicory-bloom ${className}`} aria-hidden="true" />;
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <Bloom />
      <span>chicory</span>
    </span>
  );
}

export function AccessShell({
  title,
  description,
  children,
  action,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <main className="access-shell">
      <header className="access-header">
        <Wordmark />
        {action || (
          <span className="access-platform">
            <Monitor size={15} aria-hidden /> Web wallet
          </span>
        )}
      </header>
      <div className="access-layout">
        <div className="access-art" aria-hidden="true">
          <div className="flower-field">
            <i className="flower-orbit orbit-outer" />
            <i className="flower-orbit orbit-mid" />
            <i className="flower-orbit orbit-inner" />
            <Bloom className="hero-bloom" />
          </div>
          <div className="art-caption">
            <span>Chicory Wallet</span>
            <span>
              <Zap size={14} /> Bitcoin &amp; Lightning
            </span>
          </div>
        </div>
        <section className="access-content">
          <div className="access-heading">
            <span className="access-symbol">
              <Fingerprint size={24} strokeWidth={1.5} aria-hidden />
            </span>
            {title && <h1>{title}</h1>}
            {description && <p>{description}</p>}
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}
