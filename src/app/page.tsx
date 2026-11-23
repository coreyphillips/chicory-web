import { Identity } from '@/components/Identity';
import { Wallet } from '@/templates/Wallet/Wallet';
import { WalletTabProvider } from '@/templates/Wallet/WalletTab';

export default async function Home({ searchParams }: { searchParams: Promise<{ recipient?: string | string[] }> }) {
  const { recipient } = await searchParams;
  return (
    <Identity>
      <WalletTabProvider>
        <Wallet recipient={typeof recipient === 'string' ? recipient : undefined} />
      </WalletTabProvider>
    </Identity>
  );
}
