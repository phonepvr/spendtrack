import { useEffect, useState } from 'react';
import {
  deriveSecrets,
  generatePassphrase,
  isValidPassphrase,
  normalizePassphrase,
  saveStoredPairing,
  type StoredPairing,
} from '../lib/pairing';
import type { UserId } from '../lib/schema';

type Mode = 'choose' | 'create-show' | 'create-wait' | 'join-enter' | 'join-progress';

interface Props {
  hasSignaling: boolean;
  signalingCount: number;
  signalingConnected: number;
  hasPeer: boolean;
  synced: boolean;
  bundleReady: boolean;
  pairingActive: boolean;
  existingPassphrase?: string;
  onPersisted: (stored: StoredPairing) => void;
  onIdentityChosen: (self: UserId, labels: { A: string; B: string }) => void;
  onSkip: () => void;
  onOpenDebug: () => void;
}

interface StageProps {
  state: 'done' | 'active' | 'pending';
  title: string;
  detail?: string;
}

function Stage({ state, title, detail }: StageProps) {
  const dotClass =
    state === 'done'
      ? 'bg-emerald-500'
      : state === 'active'
        ? 'bg-amber-500 animate-pulse'
        : 'bg-slate-300 dark:bg-slate-700';
  const titleClass =
    state === 'pending'
      ? 'text-slate-400 dark:text-slate-500'
      : 'text-slate-800 dark:text-slate-100';
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
      <div className="flex-1">
        <div className={`text-sm font-medium ${titleClass}`}>
          {title}
          {state === 'done' && <span className="ml-1 text-emerald-600 dark:text-emerald-400">✓</span>}
        </div>
        {detail && (
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{detail}</div>
        )}
      </div>
    </div>
  );
}

export function PairingScreen(props: Props) {
  const {
    hasSignaling,
    signalingCount,
    signalingConnected,
    hasPeer,
    synced,
    bundleReady,
    pairingActive,
    existingPassphrase,
    onPersisted,
    onIdentityChosen,
    onSkip,
    onOpenDebug,
  } = props;

  const [mode, setMode] = useState<Mode>(() =>
    props.pairingActive && existingPassphrase ? 'create-wait' : 'choose',
  );
  const [generated, setGenerated] = useState<string>(() => existingPassphrase ?? '');
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selfLabel, setSelfLabel] = useState('Me');
  const [partnerLabel, setPartnerLabel] = useState('Partner');
  const [selfId, setSelfId] = useState<UserId>('A');
  const [submittedIdentity, setSubmittedIdentity] = useState(false);
  const [waitStart, setWaitStart] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);

  const isWaitingMode = mode === 'create-wait' || mode === 'join-progress';

  useEffect(() => {
    if (!isWaitingMode) {
      setWaitStart(null);
      return;
    }
    setWaitStart(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isWaitingMode]);

  const stallMs = waitStart ? now - waitStart : 0;
  const showStallHelp = isWaitingMode && stallMs > 10000;

  const identityValid = selfLabel.trim().length > 0 && partnerLabel.trim().length > 0;

  useEffect(() => {
    if (!isWaitingMode) return;
    if (!bundleReady || !pairingActive) return;
    if (!identityValid) return;
    if (!synced) return;
    if (submittedIdentity) return;
    setSubmittedIdentity(true);
    onIdentityChosen(selfId, {
      A: selfId === 'A' ? selfLabel.trim() : partnerLabel.trim(),
      B: selfId === 'B' ? selfLabel.trim() : partnerLabel.trim(),
    });
  }, [
    isWaitingMode,
    bundleReady,
    pairingActive,
    identityValid,
    synced,
    selfId,
    selfLabel,
    partnerLabel,
    submittedIdentity,
    onIdentityChosen,
  ]);

  async function persistPairing(pass: string, nextMode: 'create-wait' | 'join-progress') {
    setBusy(true);
    setError(null);
    try {
      const secrets = await deriveSecrets(pass);
      const stored: StoredPairing = { ...secrets, createdAt: Date.now() };
      saveStoredPairing(stored);
      onPersisted(stored);
      setMode(nextMode);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function startCreate() {
    setGenerated(generatePassphrase());
    setSelfId('A');
    setMode('create-show');
  }

  function startJoin() {
    setInput('');
    setSelfId('B');
    setMode('join-enter');
  }

  async function confirmCreate() {
    await persistPairing(generated, 'create-wait');
  }

  async function confirmJoin() {
    const normalized = normalizePassphrase(input);
    if (!isValidPassphrase(normalized)) {
      setError('Passphrase must be at least 4 lowercase words separated by dashes or spaces.');
      return;
    }
    await persistPairing(normalized, 'join-progress');
  }

  async function copyPassphrase(text: string) {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  }

  const identityFields = (
    <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
      <h3 className="text-sm font-semibold">Your identity on this device</h3>
      <div>
        <label className="label">Your name</label>
        <input
          className="input mt-1"
          value={selfLabel}
          onChange={(e) => setSelfLabel(e.target.value)}
          autoCapitalize="words"
        />
      </div>
      <div>
        <label className="label">Partner&rsquo;s name</label>
        <input
          className="input mt-1"
          value={partnerLabel}
          onChange={(e) => setPartnerLabel(e.target.value)}
          autoCapitalize="words"
        />
      </div>
      <div>
        <label className="label">Which side are you?</label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`btn ${selfId === 'A' ? 'btn-primary' : 'btn-ghost border border-slate-300 dark:border-slate-700'}`}
            onClick={() => setSelfId('A')}
          >
            Side A
          </button>
          <button
            type="button"
            className={`btn ${selfId === 'B' ? 'btn-primary' : 'btn-ghost border border-slate-300 dark:border-slate-700'}`}
            onClick={() => setSelfId('B')}
          >
            Side B
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          One of you must pick A, the other B. By convention, whoever generated the passphrase is A.
        </p>
      </div>
    </div>
  );

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Spendtrack</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Private expense splitting for two devices.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenDebug}
          className="rounded-full p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          title="Debug info"
          aria-label="Debug info"
        >
          ⓘ
        </button>
      </header>

      {mode === 'choose' && (
        <div className="card flex flex-col gap-4 p-5">
          <p className="text-sm">
            Pair the two phones once. The passphrase is the shared secret &mdash; it never leaves
            your devices, and the public signaling server only sees a derived room ID.
          </p>
          <button className="btn-primary" onClick={startCreate}>
            Create new pairing
          </button>
          <button className="btn-ghost" onClick={startJoin}>
            Enter existing passphrase
          </button>
          <button className="btn-ghost text-sm" onClick={onSkip}>
            Use offline-only on this device
          </button>
        </div>
      )}

      {mode === 'create-show' && (
        <div className="card flex flex-col gap-4 p-5">
          <h2 className="text-lg font-semibold">New passphrase</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Read these words to your partner&rsquo;s phone, or send them over a secure messenger.
            Keep them safe; anyone with this passphrase can read and edit your shared expenses.
          </p>
          <div className="rounded-lg bg-slate-100 p-4 font-mono text-base tracking-wide dark:bg-slate-800">
            {generated}
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => copyPassphrase(generated)}>
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            <button className="btn-ghost" onClick={() => setGenerated(generatePassphrase())}>
              Regenerate
            </button>
            <button className="btn-ghost" onClick={() => setShowQR(true)}>
              Show QR
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setMode('choose')}>
              Back
            </button>
            <button className="btn-primary flex-1" disabled={busy} onClick={confirmCreate}>
              I&rsquo;ve saved it &rarr;
            </button>
          </div>
        </div>
      )}

      {mode === 'create-wait' && (
        <div className="card flex flex-col gap-4 p-5">
          <h2 className="text-lg font-semibold">Share this code with your partner</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Read it aloud or send it via your preferred secure messenger.
          </p>
          <div className="rounded-lg bg-slate-100 p-4 font-mono text-base tracking-wide dark:bg-slate-800">
            {generated}
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => copyPassphrase(generated)}>
              {copied ? 'Copied ✓' : 'Copy code'}
            </button>
            <button className="btn-ghost" onClick={() => setShowQR(true)}>
              Show QR
            </button>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
            <Stage
              state={hasSignaling ? 'done' : 'active'}
              title="Signaling"
              detail={
                hasSignaling
                  ? `connected to ${signalingConnected} of ${signalingCount} servers`
                  : signalingCount > 0
                    ? `connecting (0 of ${signalingCount})`
                    : 'starting...'
              }
            />
            <Stage
              state={hasPeer ? 'done' : hasSignaling ? 'active' : 'pending'}
              title="Waiting for partner to join"
              detail={hasPeer ? 'partner connected' : 'asking signaling server for partner'}
            />
            <Stage
              state={synced ? 'done' : hasPeer ? 'active' : 'pending'}
              title="Syncing initial state"
              detail={synced ? 'caught up' : hasPeer ? 'exchanging history' : '—'}
            />
          </div>
          {showStallHelp && (
            <button
              type="button"
              onClick={onOpenDebug}
              className="text-left text-sm text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
            >
              Still trying — tap for help
            </button>
          )}
          {identityFields}
          {!identityValid && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Fill in both names so we can label expenses on this device.
            </p>
          )}
        </div>
      )}

      {mode === 'join-enter' && (
        <div className="card flex flex-col gap-4 p-5">
          <h2 className="text-lg font-semibold">Enter passphrase</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Type the words from your partner&rsquo;s device. Words can be separated by spaces or
            dashes.
          </p>
          <textarea
            className="input min-h-[6rem] font-mono"
            placeholder="word-word-word-word-word-word"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          {identityFields}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setMode('choose')}>
              Back
            </button>
            <button
              className="btn-primary flex-1"
              disabled={busy || !identityValid}
              onClick={confirmJoin}
            >
              Pair &rarr;
            </button>
          </div>
        </div>
      )}

      {mode === 'join-progress' && (
        <div className="card flex flex-col gap-4 p-5">
          <h2 className="text-lg font-semibold">Connecting to your partner</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Make sure your partner&rsquo;s app is open on the share screen.
          </p>
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
            <Stage
              state={hasSignaling ? 'done' : 'active'}
              title="Connecting to signaling server"
              detail={
                hasSignaling
                  ? `${signalingConnected} of ${signalingCount} reachable`
                  : signalingCount > 0
                    ? `trying ${signalingCount} server${signalingCount === 1 ? '' : 's'}`
                    : 'starting...'
              }
            />
            <Stage
              state={hasPeer ? 'done' : hasSignaling ? 'active' : 'pending'}
              title="Waiting for partner"
              detail={hasPeer ? 'partner found' : 'looking for your partner in the room'}
            />
            <Stage
              state={synced ? 'done' : hasPeer ? 'active' : 'pending'}
              title="Syncing initial state"
              detail={synced ? 'caught up' : hasPeer ? 'exchanging history' : '—'}
            />
          </div>
          {showStallHelp && (
            <button
              type="button"
              onClick={onOpenDebug}
              className="text-left text-sm text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
            >
              Still trying — tap for help
            </button>
          )}
        </div>
      )}

      {showQR && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowQR(false)}
        >
          <div className="max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <h3 className="text-base font-semibold">QR pairing</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Coming in a later update. For now, read the words to your partner or send them via a
              secure messenger.
            </p>
            <button className="btn-primary mt-4 w-full" onClick={() => setShowQR(false)}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
