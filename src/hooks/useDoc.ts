import { useEffect, useMemo, useState } from 'react';
import type { DocBundle } from '../lib/doc';
import { openDoc, readExpense, readSettlement, readSettings } from '../lib/doc';
import type { StoredPairing } from '../lib/pairing';
import type { Expense, Settings, Settlement } from '../lib/schema';
import { DEFAULT_SETTINGS } from '../lib/schema';

export type SyncState = 'offline' | 'connecting' | 'synced';

export interface DocState {
  bundle: DocBundle | null;
  ready: boolean;
  expenses: Expense[];
  settlements: Settlement[];
  settings: Settings;
  syncState: SyncState;
  peerCount: number;
}

export function useDoc(pairing: StoredPairing | null): DocState {
  const [bundle, setBundle] = useState<DocBundle | null>(null);
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const [peerCount, setPeerCount] = useState(0);
  const [online, setOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    let cancelled = false;
    let current: DocBundle | null = null;
    setReady(false);
    setBundle(null);
    setPeerCount(0);

    openDoc(pairing).then((b) => {
      if (cancelled) {
        b.destroy();
        return;
      }
      current = b;
      setBundle(b);
      setReady(true);

      const onUpdate = () => setTick((n) => n + 1);
      b.expenses.observeDeep(onUpdate);
      b.settlements.observeDeep(onUpdate);
      b.settings.observeDeep(onUpdate);

      let peerListener: (() => void) | null = null;
      if (b.webrtc) {
        const update = () => {
          const room = b.webrtc?.room;
          if (!room) {
            setPeerCount(0);
            return;
          }
          setPeerCount(room.webrtcConns.size);
        };
        b.webrtc.on('peers', update);
        b.webrtc.on('synced', update);
        peerListener = () => {
          b.webrtc?.off('peers', update);
          b.webrtc?.off('synced', update);
        };
        update();
      }

      (b as DocBundle & { __cleanup?: () => void }).__cleanup = () => {
        b.expenses.unobserveDeep(onUpdate);
        b.settlements.unobserveDeep(onUpdate);
        b.settings.unobserveDeep(onUpdate);
        peerListener?.();
      };
    });

    return () => {
      cancelled = true;
      if (current) {
        const c = (current as DocBundle & { __cleanup?: () => void }).__cleanup;
        c?.();
        current.destroy();
      }
    };
  }, [pairing?.docName, pairing?.roomId]);

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

  const syncState: SyncState = !pairing
    ? 'offline'
    : !online
      ? 'offline'
      : peerCount > 0
        ? 'synced'
        : 'connecting';

  return {
    bundle,
    ready,
    expenses: derived.expenses,
    settlements: derived.settlements,
    settings: derived.settings,
    syncState,
    peerCount,
  };
}
