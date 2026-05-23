import type { SyncState } from '../hooks/useDoc';

interface Props {
  state: SyncState;
  lastSentAt: number | null;
  lastReceivedAt: number | null;
  onClick?: () => void;
}

const COLOR: Record<SyncState, string> = {
  unpaired: 'bg-slate-400',
  'never-synced': 'bg-amber-500',
  'pending-share': 'bg-amber-500',
  'in-sync': 'bg-emerald-500',
};

const LABEL: Record<SyncState, string> = {
  unpaired: 'Solo',
  'never-synced': 'Never synced',
  'pending-share': 'Share pending',
  'in-sync': 'In sync',
};

function relative(ms: number | null): string {
  if (ms == null) return 'never';
  const delta = Math.round((Date.now() - ms) / 1000);
  if (delta < 60) return 'just now';
  if (delta < 3600) return `${Math.round(delta / 60)}m ago`;
  if (delta < 86_400) return `${Math.round(delta / 3600)}h ago`;
  return `${Math.round(delta / 86_400)}d ago`;
}

export function SyncStatus({ state, lastSentAt, lastReceivedAt, onClick }: Props) {
  const lastTouch = Math.max(lastSentAt ?? 0, lastReceivedAt ?? 0) || null;
  const tip =
    state === 'unpaired'
      ? 'No partner paired'
      : state === 'never-synced'
        ? 'You haven’t shared with your partner yet'
        : state === 'pending-share'
          ? `You have unshared changes. Last sync ${relative(lastTouch)}`
          : `Synced ${relative(lastTouch)}`;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      title={tip}
      aria-label="Sync status — tap for details"
    >
      <span className={`h-2 w-2 rounded-full ${COLOR[state]}`} />
      {LABEL[state]}
    </button>
  );
}
