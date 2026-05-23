import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { useDoc } from './hooks/useDoc';
import { BalanceCard } from './components/BalanceCard';
import { DebugPanel } from './components/DebugPanel';
import { ExpenseForm } from './components/ExpenseForm';
import { ExpenseList } from './components/ExpenseList';
import { Modal } from './components/Modal';
import { PairingScreen } from './components/PairingScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { SettlementForm } from './components/SettlementForm';
import { SyncStatus } from './components/SyncStatus';
import { Toast } from './components/Toast';
import { netFromExpenses, totalForMonth } from './lib/balance';
import {
  findIndexById,
  writeExpense,
  writeSettings,
  writeSettlement,
} from './lib/doc';
import {
  exportSnapshot,
  getLastExportAt,
  shareOrDownload,
} from './lib/exportImport';
import { loadStoredPairing, type StoredPairing } from './lib/pairing';
import { partner, type Expense, type Settlement, type UserId } from './lib/schema';

type Sheet =
  | { kind: 'none' }
  | { kind: 'expense'; expense: Expense | null }
  | { kind: 'settlement'; settlement: Settlement | null };

interface PendingIdentity {
  self: UserId;
  labels: { A: string; B: string };
}

function urlHasDebug(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URL(window.location.href).searchParams.get('debug') === '1';
  } catch {
    return false;
  }
}

const BACKUP_NUDGE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const BACKUP_NUDGE_DISMISS_MS = 24 * 60 * 60 * 1000;

interface BackupNudgeProps {
  recordCount: number;
  dismissedAt: number | null;
  onDismiss: () => void;
  onBackup: () => void;
}

function BackupNudge({ recordCount, dismissedAt, onDismiss, onBackup }: BackupNudgeProps) {
  const lastExport = getLastExportAt();
  const now = Date.now();
  if (recordCount === 0) return null;
  if (dismissedAt && now - dismissedAt < BACKUP_NUDGE_DISMISS_MS) return null;
  if (lastExport && now - lastExport < BACKUP_NUDGE_AFTER_MS) return null;
  const daysSince = lastExport ? Math.floor((now - lastExport) / 86_400_000) : null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-900/20">
      <div className="flex-1">
        <div className="font-medium text-amber-900 dark:text-amber-200">Back up your data</div>
        <div className="text-xs text-amber-800 dark:text-amber-300">
          {daysSince == null
            ? 'You haven’t exported a backup yet.'
            : `Last backup was ${daysSince} day${daysSince === 1 ? '' : 's'} ago.`}
        </div>
      </div>
      <button
        type="button"
        className="btn-primary px-3 py-1 text-xs"
        onClick={onBackup}
      >
        Back up
      </button>
      <button
        type="button"
        className="text-xs text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        Later
      </button>
    </div>
  );
}

export default function App() {
  const [pairing, setPairing] = useState<StoredPairing | null>(null);
  const [pairingLoaded, setPairingLoaded] = useState(false);
  const [skippedPairing, setSkippedPairing] = useState(false);
  const [pendingIdentity, setPendingIdentity] = useState<PendingIdentity | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [debugOpen, setDebugOpen] = useState(() => urlHasDebug());
  const [sheet, setSheet] = useState<Sheet>({ kind: 'none' });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [backupBannerDismissedAt, setBackupBannerDismissedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStoredPairing().then((p) => {
      if (cancelled) return;
      setPairing(p);
      setPairingLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const docState = useDoc(pairing);
  const {
    bundle,
    ready,
    expenses,
    settlements,
    settings,
    syncState,
    peerCount,
    bcPeerCount,
    awarenessCount,
    signalingStatuses,
    online,
    hasSignaling,
    lastSyncAt,
    lastUpdateAt,
  } = docState;

  const synced = lastSyncAt != null && peerCount > 0;
  const showPairing = pairingLoaded && !settings.paired && !skippedPairing;

  useEffect(() => {
    if (!ready || !bundle || !pendingIdentity) return;
    bundle.doc.transact(() => {
      writeSettings(bundle.settings, {
        selfId: pendingIdentity.self,
        labels: pendingIdentity.labels,
        paired: true,
        pairingCreatedAt: Date.now(),
      });
    });
    setPendingIdentity(null);
  }, [ready, bundle, pendingIdentity]);

  const wasPairedRef = useRef(settings.paired);
  useEffect(() => {
    if (!wasPairedRef.current && settings.paired) {
      const partnerName = settings.labels[partner(settings.selfId)] || 'partner';
      setToastMsg(`Connected to ${partnerName}`);
    }
    wasPairedRef.current = settings.paired;
  }, [settings.paired, settings.labels, settings.selfId]);

  const balance = useMemo(
    () => netFromExpenses(expenses, settlements, settings.selfId, settings.primaryCurrency),
    [expenses, settlements, settings.selfId, settings.primaryCurrency],
  );

  const monthKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const monthLabel = useMemo(
    () => new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    [],
  );
  const monthTotal = useMemo(
    () => totalForMonth(expenses, monthKey, settings.primaryCurrency),
    [expenses, monthKey, settings.primaryCurrency],
  );

  const onPairingPersisted = useCallback((stored: StoredPairing) => {
    setPairing(stored);
  }, []);

  const onIdentityChosen = useCallback(
    (self: UserId, labels: { A: string; B: string }) => {
      setPendingIdentity({ self, labels });
    },
    [],
  );

  function saveExpense(e: Expense) {
    if (!bundle) return;
    bundle.doc.transact(() => {
      const idx = findIndexById(bundle.expenses, e.id);
      if (idx === -1) {
        const m = new Y.Map<unknown>();
        writeExpense(m, e);
        bundle.expenses.push([m]);
      } else {
        writeExpense(bundle.expenses.get(idx), e);
      }
    });
    setSheet({ kind: 'none' });
  }

  function deleteExpense(id: string) {
    if (!bundle) return;
    const idx = findIndexById(bundle.expenses, id);
    if (idx >= 0) bundle.expenses.delete(idx, 1);
    setSheet({ kind: 'none' });
  }

  function saveSettlement(s: Settlement) {
    if (!bundle) return;
    bundle.doc.transact(() => {
      const idx = findIndexById(bundle.settlements, s.id);
      if (idx === -1) {
        const m = new Y.Map<unknown>();
        writeSettlement(m, s);
        bundle.settlements.push([m]);
      } else {
        writeSettlement(bundle.settlements.get(idx), s);
      }
    });
    setSheet({ kind: 'none' });
  }

  function deleteSettlement(id: string) {
    if (!bundle) return;
    const idx = findIndexById(bundle.settlements, id);
    if (idx >= 0) bundle.settlements.delete(idx, 1);
    setSheet({ kind: 'none' });
  }

  function unpair() {
    setPairing(null);
    setShowSettings(false);
    setSkippedPairing(false);
  }

  const titlePressTimer = useRef<number | null>(null);
  const titleLongPressFired = useRef(false);
  const titleProps = {
    onPointerDown: () => {
      titleLongPressFired.current = false;
      titlePressTimer.current = window.setTimeout(() => {
        titleLongPressFired.current = true;
        setDebugOpen(true);
      }, 600);
    },
    onPointerUp: () => {
      if (titlePressTimer.current != null) {
        window.clearTimeout(titlePressTimer.current);
        titlePressTimer.current = null;
      }
    },
    onPointerLeave: () => {
      if (titlePressTimer.current != null) {
        window.clearTimeout(titlePressTimer.current);
        titlePressTimer.current = null;
      }
    },
    onPointerCancel: () => {
      if (titlePressTimer.current != null) {
        window.clearTimeout(titlePressTimer.current);
        titlePressTimer.current = null;
      }
    },
  };

  const signalingCount = signalingStatuses.length;
  const signalingConnected = signalingStatuses.filter((s) => s.connected).length;

  const debugPanel = (
    <DebugPanel
      open={debugOpen}
      onClose={() => setDebugOpen(false)}
      bundle={bundle}
      pairing={pairing}
      signalingStatuses={signalingStatuses}
      peerCount={peerCount}
      bcPeerCount={bcPeerCount}
      awarenessCount={awarenessCount}
      online={online}
      lastSyncAt={lastSyncAt}
      lastUpdateAt={lastUpdateAt}
      expenseCount={expenses.length}
      settlementCount={settlements.length}
    />
  );

  if (!pairingLoaded) {
    return (
      <div className="flex min-h-full items-center justify-center text-slate-500">Loading…</div>
    );
  }

  if (showPairing) {
    return (
      <>
        <PairingScreen
          hasSignaling={hasSignaling}
          signalingCount={signalingCount}
          signalingConnected={signalingConnected}
          hasPeer={peerCount > 0}
          synced={synced}
          bundleReady={ready}
          pairingActive={!!pairing}
          existingPassphrase={pairing?.passphrase}
          onPersisted={onPairingPersisted}
          onIdentityChosen={onIdentityChosen}
          onSkip={() => setSkippedPairing(true)}
          onOpenDebug={() => setDebugOpen(true)}
        />
        {debugPanel}
      </>
    );
  }

  if (!ready || !bundle) {
    return (
      <>
        <div className="flex min-h-full items-center justify-center text-slate-500">Loading…</div>
        {debugPanel}
      </>
    );
  }

  if (showSettings) {
    return (
      <>
        <SettingsScreen
          bundle={bundle}
          settings={settings}
          onClose={() => setShowSettings(false)}
          onUnpair={unpair}
        />
        {debugPanel}
      </>
    );
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-4 pb-24">
      <header className="flex items-center justify-between">
        <h1
          className="select-none text-2xl font-bold"
          {...titleProps}
          title="Long-press for debug info"
        >
          Spendtrack
        </h1>
        <div className="flex items-center gap-2">
          <SyncStatus
            state={syncState}
            peerCount={peerCount}
            onClick={() => setDebugOpen(true)}
          />
          <button
            className="rounded-full p-2 text-slate-500 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </header>

      <BackupNudge
        recordCount={expenses.length + settlements.length}
        dismissedAt={backupBannerDismissedAt}
        onDismiss={() => setBackupBannerDismissedAt(Date.now())}
        onBackup={async () => {
          const payload = exportSnapshot(bundle);
          const result = await shareOrDownload(payload);
          setToastMsg(result === 'shared' ? 'Backup shared.' : 'Backup downloaded.');
        }}
      />

      <BalanceCard
        balance={balance}
        settings={settings}
        monthTotal={monthTotal}
        monthLabel={monthLabel}
      />

      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn-ghost border border-slate-300 dark:border-slate-700"
          onClick={() => setSheet({ kind: 'settlement', settlement: null })}
        >
          Record settlement
        </button>
        <button
          className="btn-primary"
          onClick={() => setSheet({ kind: 'expense', expense: null })}
        >
          + Add expense
        </button>
      </div>

      <ExpenseList
        expenses={expenses}
        settlements={settlements}
        settings={settings}
        onEditExpense={(e) => setSheet({ kind: 'expense', expense: e })}
        onEditSettlement={(s) => setSheet({ kind: 'settlement', settlement: s })}
      />

      <Modal
        open={sheet.kind === 'expense'}
        title={sheet.kind === 'expense' && sheet.expense ? 'Edit expense' : 'New expense'}
        onClose={() => setSheet({ kind: 'none' })}
      >
        {sheet.kind === 'expense' && (
          <ExpenseForm
            initial={sheet.expense}
            settings={settings}
            onCancel={() => setSheet({ kind: 'none' })}
            onSubmit={saveExpense}
            onDelete={
              sheet.expense
                ? () => {
                    const id = sheet.expense!.id;
                    if (window.confirm('Delete this expense?')) deleteExpense(id);
                  }
                : undefined
            }
          />
        )}
      </Modal>

      <Modal
        open={sheet.kind === 'settlement'}
        title={
          sheet.kind === 'settlement' && sheet.settlement ? 'Edit settlement' : 'Record settlement'
        }
        onClose={() => setSheet({ kind: 'none' })}
      >
        {sheet.kind === 'settlement' && (
          <SettlementForm
            initial={sheet.settlement}
            settings={settings}
            onCancel={() => setSheet({ kind: 'none' })}
            onSubmit={saveSettlement}
            onDelete={
              sheet.settlement
                ? () => {
                    const id = sheet.settlement!.id;
                    if (window.confirm('Delete this settlement?')) deleteSettlement(id);
                  }
                : undefined
            }
          />
        )}
      </Modal>

      <footer className="mt-auto pt-4 text-center text-[10px] text-slate-400 dark:text-slate-600">
        Build {__BUILD_HASH__}
      </footer>

      <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />
      {debugPanel}
    </div>
  );
}
