import { useEffect, useMemo, useRef, useState } from 'react';
import type { DocBundle } from '../lib/doc';
import { openDoc, readExpense, readSettlement, readSettings } from '../lib/doc';
import type { StoredPairing } from '../lib/pairing';
import type { Expense, Settings, Settlement } from '../lib/schema';
import { DEFAULT_SETTINGS } from '../lib/schema';

export type SyncState = 'unpaired' | 'offline' | 'no-signaling' | 'waiting' | 'synced';

export interface SignalingStatus {
  url: string;
  connected: boolean;
  lastEventAt: number | null;
}

export interface DocState {
  bundle: DocBundle | null;
  ready: boolean;
  expenses: Expense[];
  settlements: Settlement[];
  settings: Settings;
  syncState: SyncState;
  peerCount: number;
  bcPeerCount: number;
  awarenessCount: number;
  signalingStatuses: SignalingStatus[];
  online: boolean;
  hasSignaling: boolean;
  lastSyncAt: number | null;
  lastUpdateAt: number | null;
}

type Cleanup = () => void;

export function useDoc(pairing: StoredPairing | null): DocState {
  const [bundle, setBundle] = useState<DocBundle | null>(null);
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const [peerCount, setPeerCount] = useState(0);
  const [bcPeerCount, setBcPeerCount] = useState(0);
  const [awarenessCount, setAwarenessCount] = useState(0);
  const [signalingStatuses, setSignalingStatuses] = useState<SignalingStatus[]>([]);
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const signalingRef = useRef<SignalingStatus[]>([]);

  useEffect(() => {
    let cancelled = false;
    let current: DocBundle | null = null;
    const cleanups: Cleanup[] = [];

    setReady(false);
    setBundle(null);
    setPeerCount(0);
    setBcPeerCount(0);
    setAwarenessCount(0);
    setSignalingStatuses([]);
    signalingRef.current = [];
    setLastSyncAt(null);
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

      if (b.webrtc) {
        const provider = b.webrtc;

        const updateCounts = () => {
          const room = provider.room;
          setPeerCount(room?.webrtcConns.size ?? 0);
          setBcPeerCount(room?.bcConns.size ?? 0);
          setAwarenessCount(provider.awareness?.states.size ?? 0);
        };

        const onPeers = () => updateCounts();
        const onSynced = () => {
          setLastSyncAt(Date.now());
          updateCounts();
        };
        provider.on('peers', onPeers);
        provider.on('synced', onSynced);

        const onAwarenessChange = () => updateCounts();
        provider.awareness?.on('change', onAwarenessChange);

        const updateSignaling = () => {
          const conns =
            (provider.signalingConns as Array<{ url: string; connected: boolean }>) ?? [];
          const prior = signalingRef.current;
          const next: SignalingStatus[] = conns.map((c) => {
            const old = prior.find((p) => p.url === c.url);
            const changed = !old || old.connected !== c.connected;
            return {
              url: c.url,
              connected: !!c.connected,
              lastEventAt: changed ? Date.now() : (old?.lastEventAt ?? null),
            };
          });
          let differs = next.length !== prior.length;
          if (!differs) {
            for (let i = 0; i < next.length; i++) {
              if (
                next[i].url !== prior[i].url ||
                next[i].connected !== prior[i].connected
              ) {
                differs = true;
                break;
              }
            }
          }
          if (differs) {
            signalingRef.current = next;
            setSignalingStatuses(next);
          }
        };

        const onStatus = () => updateSignaling();
        provider.on('status', onStatus);
        const signalingInterval = window.setInterval(updateSignaling, 1500);
        updateSignaling();
        updateCounts();

        cleanups.push(() => {
          provider.off('peers', onPeers);
          provider.off('synced', onSynced);
          provider.off('status', onStatus);
          provider.awareness?.off('change', onAwarenessChange);
          window.clearInterval(signalingInterval);
        });
      }
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

  const hasSignaling = signalingStatuses.some((s) => s.connected);

  const syncState: SyncState = !pairing
    ? 'unpaired'
    : !online
      ? 'offline'
      : !hasSignaling
        ? 'no-signaling'
        : peerCount > 0
          ? 'synced'
          : 'waiting';

  return {
    bundle,
    ready,
    expenses: derived.expenses,
    settlements: derived.settlements,
    settings: derived.settings,
    syncState,
    peerCount,
    bcPeerCount,
    awarenessCount,
    signalingStatuses,
    online,
    hasSignaling,
    lastSyncAt,
    lastUpdateAt,
  };
}
