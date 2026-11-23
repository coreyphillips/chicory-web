import { QRCodeSVG } from 'qrcode.react';

interface QrCodeSlotProps {
  isLoading: boolean;
  isExpired: boolean;
  generatingLabel: string;
  clickToReloadLabel: string;
  url: string;
  size?: number;
}

export function QrCodeSlot({ isLoading, isExpired, generatingLabel, clickToReloadLabel, url, size = 176 }: QrCodeSlotProps) {
  if (isExpired) return <span>{clickToReloadLabel}</span>;
  if (isLoading || !url) return <span role="status">{generatingLabel}</span>;
  return <QRCodeSVG value={url} size={size} marginSize={4} title="Scan with Pubky Ring" />;
}
