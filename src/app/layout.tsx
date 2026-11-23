import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chicory Wallet',
  description: 'Your Bitcoin and Lightning wallet for the web.',
  icons: { icon: '/brand/icon-180.png', apple: '/brand/icon-180.png' },
};
export const viewport: Viewport = { themeColor: '#110e0c', colorScheme: 'dark' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Every wallet document must render with the nonce issued for this request.
  await connection();
  return <html lang="en"><body>{children}</body></html>;
}
