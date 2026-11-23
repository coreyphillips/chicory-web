import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chicory Wallet',
  description: 'Your Bitcoin and Lightning wallet for the web.',
  icons: { icon: '/brand/icon-180.png', apple: '/brand/icon-180.png' },
};
export const viewport: Viewport = { themeColor: '#110e0c', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
