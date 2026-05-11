import type { SyncState } from '../hooks/useDoc';

interface Props {
  state: SyncState;
  peerCount: number;
  onClick?: () => void;
}

const COLOR: Record<SyncState, string> = {
  unpaired: 'bg-slate-400',
  offline: 'bg-red-500',
  'no-signaling': 'bg-red-500',
  waiting: 'bg-amber-500 animate-pulse',
  synced: 'bg-emerald-500',
};

const LABEL: Record<SyncState, string> = {
  unpaired: 'Solo',
  offline: 'Offline',
  'no-signaling': 'No signal',
  waiting: 'Waiting',
  synced: 'Synced',
};

const TITLE: Record<SyncState, string> = {
  unpaired: 'No partner paired',
  offline: 'This device is offline',
  'no-signaling': 'Cannot reach any signaling server',
  waiting: 'Connected to signaling — waiting for partner',
  synced: 'Connected to partner',
};

export function SyncStatus({ state, peerCount, onClick }: Props) {
  const peerNote = state === 'synced' ? ` · ${peerCount}` : '';
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      title={TITLE[state]}
      aria-label="Sync status — tap for details"
    >
      <span className={`h-2 w-2 rounded-full ${COLOR[state]}`} />
      {LABEL[state]}
      {peerNote && <span className="font-normal opacity-70">{peerNote}</span>}
    </button>
  );
}
