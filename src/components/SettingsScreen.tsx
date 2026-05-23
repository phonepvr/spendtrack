import { useEffect, useRef, useState } from 'react';
import type { DocBundle } from '../lib/doc';
import type { Settings } from '../lib/schema';
import { writeSettings } from '../lib/doc';
import { clearStoredPairing, loadStoredPairing, type StoredPairing } from '../lib/pairing';
import {
  exportSnapshot,
  importFile,
  WrongPairingError,
} from '../lib/exportImport';
import { partner } from '../lib/schema';
import { wipeEverything } from '../lib/wipe';

interface Props {
  bundle: DocBundle;
  settings: Settings;
  onClose: () => void;
  onUnpair: () => void;
  onSendToPartner: () => Promise<void>;
}

export function SettingsScreen({
  bundle,
  settings,
  onClose,
  onUnpair,
  onSendToPartner,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pairing, setPairing] = useState<StoredPairing | null>(null);

  useEffect(() => {
    loadStoredPairing().then(setPairing);
  }, []);

  const partnerName = settings.labels[partner(settings.selfId)] || 'partner';

  function downloadPlainJson() {
    const payload = exportSnapshot(bundle, settings.selfId);
    const stamp = new Date(payload.exportedAt).toISOString().replace(/[:.]/g, '-');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spendtrack-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setMessage(
      `Downloaded plain JSON with ${payload.expenses.length} expenses, ${payload.settlements.length} settlements. This file is unencrypted — keep it safe.`,
    );
  }

  function pickImport() {
    fileRef.current?.click();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = await importFile(
          bundle,
          String(reader.result),
          pairing?.passphrase ?? null,
          'merge-yjs',
        );
        setMessage(
          result.added > 0
            ? `Merged ${result.added} new entr${result.added === 1 ? 'y' : 'ies'}. Total now: ${result.total}.`
            : `Already in sync. Total entries: ${result.total}.`,
        );
      } catch (err) {
        if (err instanceof WrongPairingError) {
          setMessage('This file isn’t from your pairing partner.');
        } else {
          setMessage('Import failed: ' + (err instanceof Error ? err.message : String(err)));
        }
      } finally {
        if (fileRef.current) fileRef.current.value = '';
      }
    };
    reader.readAsText(file);
  }

  function updateLabel(side: 'A' | 'B', value: string) {
    bundle.doc.transact(() => {
      writeSettings(bundle.settings, {
        labels: { ...settings.labels, [side]: value },
      });
    });
  }

  function unpair() {
    const ok = window.confirm(
      'Unpair this device? Your local data stays on this phone, but you will need the passphrase again to decrypt files from your partner.',
    );
    if (!ok) return;
    clearStoredPairing();
    onUnpair();
  }

  async function panicWipe() {
    const ok = window.confirm(
      'Wipe everything on this device? This deletes ALL expenses, settlements, settings, and pairing data. There is no undo. Your partner’s phone is not affected.',
    );
    if (!ok) return;
    const confirm2 = window.prompt('Type WIPE to confirm.');
    if (confirm2?.trim().toUpperCase() !== 'WIPE') {
      setMessage('Wipe cancelled.');
      return;
    }
    await wipeEverything();
    window.location.reload();
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        <button className="btn-ghost" onClick={onClose}>
          Done
        </button>
      </div>

      <section className="card flex flex-col gap-3 p-4">
        <h2 className="font-semibold">Names</h2>
        <label className="label">Side A</label>
        <input
          className="input"
          value={settings.labels.A}
          onChange={(e) => updateLabel('A', e.target.value)}
        />
        <label className="label">Side B</label>
        <input
          className="input"
          value={settings.labels.B}
          onChange={(e) => updateLabel('B', e.target.value)}
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Names sync to your partner&rsquo;s phone when they import an update from you.
        </p>
      </section>

      {pairing && (
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="font-semibold">Sync with {partnerName}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Sends an encrypted file via your share sheet (WhatsApp, AirDrop, email, anything).
            Your partner taps the file to merge it into their app — duplicates and lost edits are
            impossible thanks to CRDT merge.
          </p>
          <button className="btn-primary" onClick={onSendToPartner}>
            ↗ Send update to {partnerName}
          </button>
          <button
            className="btn-ghost border border-slate-300 dark:border-slate-700"
            onClick={pickImport}
          >
            Import update from {partnerName}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".spendtrack,.json,application/json,application/spendtrack+json"
            className="hidden"
            onChange={onFile}
          />
        </section>
      )}

      <section className="card flex flex-col gap-3 p-4">
        <h2 className="font-semibold">Local backup</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          For your own records — unencrypted JSON you can store anywhere. Don&rsquo;t share this
          with anyone untrusted; it contains all your expense data in plaintext.
        </p>
        <button
          className="btn-ghost border border-slate-300 dark:border-slate-700"
          onClick={downloadPlainJson}
        >
          Download plain JSON backup
        </button>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Format documented at{' '}
          <a
            href="https://github.com/phonepvr/spendtrack/blob/main/docs/SCHEMA.md"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            docs/SCHEMA.md
          </a>
          .
        </p>
      </section>

      <section className="card flex flex-col gap-2 p-4">
        <h2 className="font-semibold">What we share with the world</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Nothing. There are no servers. Your data stays on your phone unless you explicitly tap
          &ldquo;Send update&rdquo; — and even then, the file is encrypted with your passphrase, so
          whatever messenger or cloud it passes through can&rsquo;t read it.
        </p>
      </section>

      <section className="card flex flex-col gap-3 p-4">
        <h2 className="font-semibold">Pairing</h2>
        {pairing ? (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Paired since {new Date(pairing.createdAt).toLocaleDateString()}.
            </p>
            <details className="text-sm">
              <summary className="cursor-pointer">Show passphrase</summary>
              <div className="mt-2 break-all rounded-lg bg-slate-100 p-3 font-mono text-sm dark:bg-slate-800">
                {pairing.passphrase}
              </div>
            </details>
            <button className="btn-danger" onClick={unpair}>
              Unpair this device
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This device is not paired. Local-only mode.
          </p>
        )}
      </section>

      <section className="card flex flex-col gap-3 border-red-200 p-4 dark:border-red-900/50">
        <h2 className="font-semibold text-red-700 dark:text-red-300">Danger zone</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Wipe all data on this device — expenses, settlements, pairing, and the offline app
          cache. Useful if you&rsquo;re lending or selling this phone. Your partner&rsquo;s phone
          is unaffected.
        </p>
        <button className="btn-danger" onClick={panicWipe}>
          Wipe this device
        </button>
      </section>

      <footer className="pt-2 text-center text-[11px] text-slate-400 dark:text-slate-600">
        Build {__BUILD_HASH__} · {new Date(__BUILD_TIME__).toLocaleDateString()}
      </footer>

      {message && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
          {message}
        </div>
      )}
    </div>
  );
}
