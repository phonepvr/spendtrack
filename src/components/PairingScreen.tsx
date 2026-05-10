import { useState } from 'react';
import {
  deriveSecrets,
  generatePassphrase,
  isValidPassphrase,
  normalizePassphrase,
  saveStoredPairing,
} from '../lib/pairing';
import type { UserId } from '../lib/schema';

interface Props {
  onComplete: (self: UserId, labels: { A: string; B: string }) => void;
  onSkip: () => void;
}

type Mode = 'choose' | 'create' | 'join' | 'identity';

export function PairingScreen({ onComplete, onSkip }: Props) {
  const [mode, setMode] = useState<Mode>('choose');
  const [generated, setGenerated] = useState<string>('');
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selfLabel, setSelfLabel] = useState('Me');
  const [partnerLabel, setPartnerLabel] = useState('Partner');
  const [selfId, setSelfId] = useState<UserId>('A');

  async function persistPairing(pass: string) {
    setBusy(true);
    setError(null);
    try {
      const secrets = await deriveSecrets(pass);
      saveStoredPairing({ ...secrets, createdAt: Date.now() });
      setMode('identity');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function startCreate() {
    setGenerated(generatePassphrase());
    setMode('create');
  }

  function startJoin() {
    setInput('');
    setMode('join');
  }

  async function confirmCreate() {
    await persistPairing(generated);
  }

  async function confirmJoin() {
    const normalized = normalizePassphrase(input);
    if (!isValidPassphrase(normalized)) {
      setError('Passphrase must be at least 4 lowercase words separated by dashes or spaces.');
      return;
    }
    await persistPairing(normalized);
  }

  function finishIdentity() {
    onComplete(selfId, {
      A: selfId === 'A' ? selfLabel : partnerLabel,
      B: selfId === 'B' ? selfLabel : partnerLabel,
    });
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Spendtrack</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Private expense splitting for two devices.
        </p>
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

      {mode === 'create' && (
        <div className="card flex flex-col gap-4 p-5">
          <h2 className="text-lg font-semibold">New passphrase</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Type or read these words to your partner&rsquo;s phone exactly once. Keep them safe;
            anyone with the passphrase can read and edit your shared expenses.
          </p>
          <div className="rounded-lg bg-slate-100 p-4 font-mono text-base tracking-wide dark:bg-slate-800">
            {generated}
          </div>
          <div className="flex gap-2">
            <button
              className="btn-ghost"
              onClick={() => navigator.clipboard?.writeText(generated)}
            >
              Copy
            </button>
            <button className="btn-ghost" onClick={() => setGenerated(generatePassphrase())}>
              Regenerate
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setMode('choose')}>
              Back
            </button>
            <button className="btn-primary flex-1" disabled={busy} onClick={confirmCreate}>
              I&rsquo;ve saved it
            </button>
          </div>
        </div>
      )}

      {mode === 'join' && (
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
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setMode('choose')}>
              Back
            </button>
            <button className="btn-primary flex-1" disabled={busy} onClick={confirmJoin}>
              Pair
            </button>
          </div>
        </div>
      )}

      {mode === 'identity' && (
        <div className="card flex flex-col gap-4 p-5">
          <h2 className="text-lg font-semibold">Who are you?</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Pick which side you are on this device. Both devices must pick different sides.
          </p>
          <div className="flex flex-col gap-3">
            <label className="label">Your name (this device)</label>
            <input
              className="input"
              value={selfLabel}
              onChange={(e) => setSelfLabel(e.target.value)}
            />
            <label className="label">Your partner&rsquo;s name</label>
            <input
              className="input"
              value={partnerLabel}
              onChange={(e) => setPartnerLabel(e.target.value)}
            />
            <label className="label">Which side are you?</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`btn ${selfId === 'A' ? 'btn-primary' : 'btn-ghost border border-slate-300 dark:border-slate-700'}`}
                onClick={() => setSelfId('A')}
              >
                Side A
              </button>
              <button
                className={`btn ${selfId === 'B' ? 'btn-primary' : 'btn-ghost border border-slate-300 dark:border-slate-700'}`}
                onClick={() => setSelfId('B')}
              >
                Side B
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tip: agree with your partner so one of you picks A and the other picks B. This keeps
              who-paid-what consistent across both phones.
            </p>
          </div>
          <button className="btn-primary" onClick={finishIdentity}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
