import { useEffect, useMemo, useState } from 'react';
import type { DocBundle } from '../lib/doc';
import { openDoc, readExpense, readSettlement, readSettings } from '../lib/doc';
import {
  getLastReceivedAt,
  getLastSentAt,
  getPartnerLastUpdateAt,
} from '../lib/exportImport';
import type { StoredPairing } from '../lib/pairing';
import type { Expense, Settings, Settlement } from '../lib/schema';
import { DEFAULT_SETTINGS } from '../lib/schema';

export type SyncState =
  | 'unpaired'
  | 'never-synced'
  | 'pending-share'
  | 'in-sync';

export interface DocState {
  bundle: DocBundle | null;
  ready: boolean;
  expenses: Expense[];
  settlements: Settlement[];
  settings: Settings;
  syncState: SyncState;
  online: boolean;
  lastUpdateAt: number | null;
  lastSentAt: number | null;
  lastReceivedAt: number | null;
  partnerLastUpdateAt: number | null;
}

type Cleanup = () => void;

const PENDING_SHARE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export function useDoc(pairing: StoredPairing | null): DocState {
  const [bundle, setBundle] = useState<DocBundle | null>(null);
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const [syncTimestamps, setSyncTimestamps] = useState<{
    lastSentAt: number | null;
    lastReceivedAt: number | null;
    partnerLastUpdateAt: number | null;
  }>(() => ({
    lastSentAt: getLastSentAt(),
    lastReceivedAt: getLastReceivedAt(),
    partnerLastUpdateAt: getPartnerLastUpdateAt(),
  }));

  function refreshSyncTimestamps() {
    setSyncTimestamps({
      lastSentAt: getLastSentAt(),
      lastReceivedAt: getLastReceivedAt(),
      partnerLastUpdateAt: getPartnerLastUpdateAt(),
    });
  }

  useEffect(() => {
    let cancelled = false;
    let current: DocBundle | null = null;
    const cleanups: Cleanup[] = [];

    setReady(false);
    setBundle(null);
    setLastUpdateAt(null);

    openDoc(pairing).then((b) => {
      if (cancelled) {
        b.destroy();
        return;
      }
      current = b;
      setBundle(b);
      setReady(true);

      const bumpTick = () => setTick((n) => n + 1);
      b.expenses.observeDeep(bumpTick);
      b.settlements.observeDeep(bumpTick);
      b.settings.observeDeep(bumpTick);
      cleanups.push(() => {
        b.expenses.unobserveDeep(bumpTick);
        b.settlements.unobserveDeep(bumpTick);
        b.settings.unobserveDeep(bumpTick);
      });

      const onDocUpdate = () => setLastUpdateAt(Date.now());
      b.doc.on('update', onDocUpdate);
      cleanups.push(() => b.doc.off('update', onDocUpdate));
    });

    return () => {
      cancelled = true;
      for (const fn of cleanups) {
        try {
          fn();
        } catch {
          /* swallow */
        }
      }
      if (current) {
        current.destroy();
      }
    };
  }, [pairing?.docName]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('spendtrack/last')) refreshSyncTimestamps();
      if (e.key === 'spendtrack/partnerLastUpdateAt/v1') refreshSyncTimestamps();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const derived = useMemo(() => {
    if (!bundle) {
      return {
        expenses: [] as Expense[],
        settlements: [] as Settlement[],
        settings: DEFAULT_SETTINGS,
      };
    }
    return {
      expenses: bundle.expenses.toArray().map(readExpense),
      settlements: bundle.settlements.toArray().map(readSettlement),
      settings: readSettings(bundle.settings),
    };
  }, [bundle, tick]);

  const syncState: SyncState = (() => {
    if (!pairing) return 'unpaired';
    const { lastSentAt, lastReceivedAt } = syncTimestamps;
    const lastTouchAny = Math.max(lastSentAt ?? 0, lastReceivedAt ?? 0) || null;
    if (!lastTouchAny) return 'never-synced';
    if (lastUpdateAt && lastUpdateAt > (lastSentAt ?? 0)) return 'pending-share';
    if (Date.now() - lastTouchAny > PENDING_SHARE_AFTER_MS) return 'pending-share';
    return 'in-sync';
  })();

  return {
    bundle,
    ready,
    expenses: derived.expenses,
    settlements: derived.settlements,
    settings: derived.settings,
    syncState,
    online,
    lastUpdateAt,
    lastSentAt: syncTimestamps.lastSentAt,
    lastReceivedAt: syncTimestamps.lastReceivedAt,
    partnerLastUpdateAt: syncTimestamps.partnerLastUpdateAt,
  };
}

export function refreshSyncTimestampsGlobal(): void {
  window.dispatchEvent(
    new StorageEvent('storage', { key: 'spendtrack/lastSentAt/v1' }),
  );
}
