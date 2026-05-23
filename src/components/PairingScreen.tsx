import { useEffect, useRef, useState } from 'react';
import {
  deriveSecrets,
  generatePassphrase,
  isValidPassphrase,
  normalizePassphrase,
  saveStoredPairing,
  type StoredPairing,
} from '../lib/pairing';
import {
  extractPassphraseFromScan,
  isCameraScanSupported,
  parsePairingHash,
  renderQrToDataUrl,
  startCameraScan,
  type ScanHandle,
} from '../lib/qr';
import type { UserId } from '../lib/schema';

type Mode = 'choose' | 'create' | 'join';

interface Props {
  existingPassphrase?: string;
  onPersisted: (stored: StoredPairing) => void;
  onIdentityChosen: (self: UserId, labels: { A: string; B: string }) => void;
  onSkip: () => void;
  onOpenDebug: () => void;
}

export function PairingScreen(props: Props) {
  const { existingPassphrase, onPersisted, onIdentityChosen, onSkip, onOpenDebug } = props;

  const [mode, setMode] = useState<Mode>('choose');
  const [generated, setGenerated] = useState<string>(() => existingPassphrase ?? '');
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selfLabel, setSelfLabel] = useState('Me');
  const [partnerLabel, setPartnerLabel] = useState('Partner');
  const [selfId, setSelfId] = useState<UserId>('A');
  const [showQR, setShowQR] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const scanHandleRef = useRef<ScanHandle | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraScanSupported = isCameraScanSupported();

  useEffect(() => {
    if (mode !== 'choose') return;
    const hash = window.location.hash;
    const fromUrl = parsePairingHash(hash);
    if (fromUrl && isValidPassphrase(fromUrl)) {
      setInput(fromUrl);
      setSelfId('B');
      setMode('join');
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [mode]);

  useEffect(() => {
    if (!generated) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    renderQrToDataUrl(generated)
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [generated]);

  useEffect(() => {
    return () => {
      scanHandleRef.current?.stop();
      scanHandleRef.current = null;
    };
  }, []);

  const identityValid = selfLabel.trim().length > 0 && partnerLabel.trim().length > 0;

  async function persistAndCommit(pass: string) {
    setBusy(true);
    setError(null);
    try {
      const secrets = await deriveSecrets(pass);
      const stored: StoredPairing = { ...secrets, createdAt: Date.now() };
      await saveStoredPairing(stored);
      onPersisted(stored);
      onIdentityChosen(selfId, {
        A: selfId === 'A' ? selfLabel.trim() : partnerLabel.trim(),
        B: selfId === 'B' ? selfLabel.trim() : partnerLabel.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function startCreate() {
    setGenerated(generatePassphrase());
    setSelfId('A');
    setMode('create');
  }

  function startJoin() {
    setInput('');
    setSelfId('B');
    setMode('join');
  }

  async function confirmCreate() {
    if (!identityValid) {
      setError('Fill in both names so we can label expenses on this device.');
      return;
    }
    await persistAndCommit(generated);
  }

  async function confirmJoin() {
    const normalized = normalizePassphrase(input);
    if (!isValidPassphrase(normalized)) {
      setError('Passphrase must be at least 4 lowercase words separated by dashes or spaces.');
      return;
    }
    if (!identityValid) {
      setError('Fill in both names so we can label expenses on this device.');
      return;
    }
    await persistAndCommit(normalized);
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

  async function beginScan() {
    if (!videoRef.current) return;
    setScanError(null);
    setScanning(true);
    try {
      const handle = await startCameraScan(
        videoRef.current,
        (text) => {
          const extracted = extractPassphraseFromScan(text);
          if (extracted && isValidPassphrase(extracted)) {
            handle.stop();
            scanHandleRef.current = null;
            setScanning(false);
            setInput(extracted);
          }
        },
        (err) => setScanError(err.message),
      );
      scanHandleRef.current = handle;
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e));
      setScanning(false);
    }
  }

  function stopScan() {
    scanHandleRef.current?.stop();
    scanHandleRef.current = null;
    setScanning(false);
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
          One of you must pick A, the other B. By convention, whoever generates the passphrase is A.
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
            Pair the two phones once with a shared passphrase. After that, each phone keeps its
            own copy and you sync by sharing an encrypted file (WhatsApp, AirDrop, email — any
            channel) whenever you want to converge.
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
          <h2 className="text-lg font-semibold">New pairing</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Share these words with your partner so their device can decrypt files you send. Anyone
            with this passphrase can read and edit your shared expenses, so keep it private.
          </p>
          <div className="rounded-lg bg-slate-100 p-4 font-mono text-base tracking-wide dark:bg-slate-800">
            {generated}
          </div>
          <div className="flex flex-wrap gap-2">
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
          {identityFields}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setMode('choose')}>
              Back
            </button>
            <button
              className="btn-primary flex-1"
              disabled={busy || !identityValid}
              onClick={confirmCreate}
            >
              Done &rarr;
            </button>
          </div>
        </div>
      )}

      {mode === 'join' && (
        <div className="card flex flex-col gap-4 p-5">
          <h2 className="text-lg font-semibold">Enter passphrase</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Scan the QR on your partner&rsquo;s device, or type the words.
          </p>
          {cameraScanSupported && !scanning && (
            <button
              className="btn-ghost border border-slate-300 dark:border-slate-700"
              onClick={beginScan}
            >
              Scan QR code
            </button>
          )}
          {scanning && (
            <div className="flex flex-col gap-2">
              <video
                ref={videoRef}
                className="w-full rounded-lg bg-slate-900"
                muted
                playsInline
              />
              <button className="btn-ghost text-sm" onClick={stopScan}>
                Cancel scan
              </button>
            </div>
          )}
          {scanError && <p className="text-sm text-amber-700 dark:text-amber-300">{scanError}</p>}
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
            <button
              className="btn-ghost flex-1"
              onClick={() => {
                stopScan();
                setMode('choose');
              }}
            >
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

      {showQR && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowQR(false)}
        >
          <div
            className="max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Scan this on your partner&rsquo;s phone</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Opens the join flow with the passphrase pre-filled.
            </p>
            <div className="mt-4 flex justify-center">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Pairing QR code"
                  className="h-64 w-64 rounded-lg bg-white"
                />
              ) : (
                <div className="flex h-64 w-64 items-center justify-center text-sm text-slate-400">
                  Rendering…
                </div>
              )}
            </div>
            <p className="mt-3 break-words text-center font-mono text-xs text-slate-500 dark:text-slate-400">
              {generated}
            </p>
            <button className="btn-primary mt-4 w-full" onClick={() => setShowQR(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
