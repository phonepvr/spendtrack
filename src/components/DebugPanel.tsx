import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import type { DocBundle } from '../lib/doc';
import type { StoredPairing } from '../lib/pairing';
import type { SignalingStatus } from '../hooks/useDoc';

interface Props {
  open: boolean;
  onClose: () => void;
  bundle: DocBundle | null;
  pairing: StoredPairing | null;
  signalingStatuses: SignalingStatus[];
  peerCount: number;
  bcPeerCount: number;
  awarenessCount: number;
  online: boolean;
  lastSyncAt: number | null;
  lastUpdateAt: number | null;
  expenseCount: number;
  settlementCount: number;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toHex(new Uint8Array(buf));
}

function formatTime(ms: number | null): string {
  if (ms == null) return 'never';
  const date = new Date(ms);
  const delta = Math.round((Date.now() - ms) / 1000);
  const ago =
    delta < 60
      ? `${delta}s ago`
      : delta < 3600
        ? `${Math.round(delta / 60)}m ago`
        : `${Math.round(delta / 3600)}h ago`;
  return `${date.toISOString().replace('T', ' ').slice(0, 19)} (${ago})`;
}

function swStatus(): string {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  if (navigator.serviceWorker.controller) return 'controlled';
  return 'uncontrolled';
}

export function DebugPanel(props: Props) {
  const {
    open,
    onClose,
    bundle,
    pairing,
    signalingStatuses,
    peerCount,
    bcPeerCount,
    awarenessCount,
    online,
    lastSyncAt,
    lastUpdateAt,
    expenseCount,
    settlementCount,
  } = props;

  const [passphraseHex, setPassphraseHex] = useState<string>('');
  const [now, setNow] = useState<number>(Date.now());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !pairing) return;
    let cancelled = false;
    sha256Hex(pairing.passphrase).then((h) => {
      if (!cancelled) setPassphraseHex(h);
    });
    return () => {
      cancelled = true;
    };
  }, [open, pairing]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  const stateVectorHex = useMemo(() => {
    if (!bundle) return '';
    try {
      return toHex(Y.encodeStateVector(bundle.doc));
    } catch {
      return 'error';
    }
  }, [bundle, lastUpdateAt]);

  const lines = useMemo(() => {
    const ua = navigator.userAgent.slice(0, 80);
    const clientId = bundle?.doc.clientID ?? 'n/a';
    const provider = bundle?.webrtc ?? null;
    const out: string[] = [];
    out.push('SPENDTRACK DEBUG');
    out.push(`Captured at:   ${new Date(now).toISOString()}`);
    out.push(`Build hash:    ${__BUILD_HASH__}`);
    out.push(`Built at:      ${__BUILD_TIME__}`);
    out.push(`SW:            ${swStatus()}`);
    out.push(`Online:        ${online}`);
    out.push(`User agent:    ${ua}`);
    out.push('');
    out.push('PAIRING');
    if (pairing) {
      out.push(`Passphrase hex: ${passphraseHex.slice(0, 16) || '(computing...)'}`);
      out.push(`Room ID:        ${pairing.roomId.slice(0, 24)}`);
      out.push(`Password:       ${pairing.webrtcPassword.slice(0, 8)}`);
      out.push(`Doc name:       ${pairing.docName}`);
      out.push(`Normalized:     ${pairing.passphrase}`);
      out.push(`Created at:     ${new Date(pairing.createdAt).toISOString()}`);
    } else {
      out.push('No pairing (solo mode)');
    }
    out.push('');
    out.push('YJS');
    out.push(`Client ID:      ${clientId}`);
    out.push(`State vector:   ${stateVectorHex.slice(0, 64) || 'n/a'}`);
    out.push(`Expenses:       ${expenseCount}`);
    out.push(`Settlements:    ${settlementCount}`);
    out.push(`Last update at: ${formatTime(lastUpdateAt)}`);
    out.push('');
    out.push('WEBRTC');
    out.push(`Provider:       ${provider ? 'present' : 'absent'}`);
    if (provider) {
      const room = provider.room;
      out.push(`Room:           ${room ? 'present' : 'absent'}`);
      out.push(`WebRTC peers:   ${peerCount}`);
      out.push(`BC peers:       ${bcPeerCount}`);
      out.push(`Awareness:      ${awarenessCount}`);
      out.push(`Last sync at:   ${formatTime(lastSyncAt)}`);
    }
    out.push('');
    out.push(`SIGNALING (${signalingStatuses.length} URLs)`);
    if (signalingStatuses.length === 0) {
      out.push('  (no signaling connections)');
    } else {
      for (const s of signalingStatuses) {
        out.push(
          `  ${s.connected ? 'CONNECTED' : '  CLOSED '}  ${s.url}  last-event ${formatTime(s.lastEventAt)}`,
        );
      }
    }
    return out;
  }, [
    bundle,
    pairing,
    passphraseHex,
    stateVectorHex,
    peerCount,
    bcPeerCount,
    awarenessCount,
    online,
    lastSyncAt,
    lastUpdateAt,
    signalingStatuses,
    expenseCount,
    settlementCount,
    now,
  ]);

  const text = lines.join('\n');

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold">Debug info</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Build {__BUILD_HASH__} · {swStatus()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-primary px-3 py-1 text-xs" onClick={copyAll}>
              {copied ? 'Copied ✓' : 'Copy all'}
            </button>
            <button className="btn-ghost px-3 py-1 text-xs" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-200">
          {text}
        </pre>
        <div className="border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Paste this into the chat so I can pinpoint what's failing. Reload the page after a deploy to refresh the build hash.
        </div>
      </div>
    </div>
  );
}
