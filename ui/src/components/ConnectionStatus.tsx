import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import type { ConnectionState } from '../types';

interface ConnectionStatusProps {
  status: ConnectionState;
}

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  const { connected, connecting, sync } = status;

  if (connected) {
    return (
      <div className="flex items-center gap-2 text-green-600">
        <Wifi className="w-4 h-4" />
        <span className="text-sm">Connected</span>
      </div>
    );
  }

  if (connecting) {
    return (
      <div className="flex items-center gap-2 text-yellow-600">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">
          {sync?.stage === 'syncing' && sync.progress !== undefined
            ? `Syncing ${sync.progress}%`
            : 'Connecting...'}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-red-600">
      <WifiOff className="w-4 h-4" />
      <span className="text-sm">Disconnected</span>
    </div>
  );
}

interface ConnectionBannerProps {
  status: ConnectionState;
}

export function ConnectionBanner({ status }: ConnectionBannerProps) {
  const { connected, connecting, sync } = status;

  if (connected) return null;

  return (
    <div
      className={clsx(
        'px-4 py-2 text-center text-sm',
        connecting ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
      )}
    >
      {connecting ? (
        sync?.stage === 'qr' ? (
          'Waiting for QR code scan. Check the terminal running the server.'
        ) : sync?.stage === 'syncing' ? (
          `Syncing messages... ${sync.progress || 0}%`
        ) : (
          'Connecting to WhatsApp...'
        )
      ) : (
        'Not connected to WhatsApp. Please check the server.'
      )}
    </div>
  );
}
