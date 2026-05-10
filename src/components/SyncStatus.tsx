import type { SyncState } from '../hooks/useDoc';

interface Props {
  state: SyncState;
  peerCount: number;
  paired: boolean;
}

const COLOR: Record<SyncState, string> = {
  offline: 'bg-slate-400',
  connecting: 'bg-amber-500 animate-pulse',
  synced: 'bg-emerald-500',
};

const LABEL: Record<SyncState, string> = {
  offline: 'Offline',
  connecting: 'Connecting',
  synced: 'Synced',
};

export function SyncStatus({ state, peerCount, paired }: Props) {
  const label = !paired ? 'Solo' : LABEL[state];
  const color = !paired ? 'bg-slate-400' : COLOR[state];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
      title={paired ? `${peerCount} peer(s)` : 'No partner paired'}
    >
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
