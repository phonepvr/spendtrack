import { useRef, useState } from 'react';
import type { DocBundle } from '../lib/doc';
import type { Settings } from '../lib/schema';
import { writeSettings } from '../lib/doc';
import { clearStoredPairing, loadStoredPairing } from '../lib/pairing';
import {
  downloadJson,
  exportSnapshot,
  importSnapshot,
  type ImportMode,
  type ExportPayload,
} from '../lib/exportImport';

interface Props {
  bundle: DocBundle;
  settings: Settings;
  onClose: () => void;
  onUnpair: () => void;
}

export function SettingsScreen({ bundle, settings, onClose, onUnpair }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<ImportMode>('merge-yjs');
  const [message, setMessage] = useState<string | null>(null);
  const pairing = loadStoredPairing();

  function exportNow() {
    const payload = exportSnapshot(bundle);
    downloadJson(payload);
    setMessage(`Exported ${payload.expenses.length} expenses, ${payload.settlements.length} settlements.`);
  }

  function pickImport() {
    fileRef.current?.click();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result)) as ExportPayload;
        const result = importSnapshot(bundle, payload, importMode);
        setMessage(
          importMode === 'merge-yjs'
            ? `Merged Yjs state. Total entries now: ${result.total}.`
            : `${importMode === 'replace' ? 'Replaced' : 'Merged records'} — added ${result.added}, updated ${result.updated}.`,
        );
      } catch (err) {
        setMessage('Import failed: ' + (err instanceof Error ? err.message : String(err)));
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
      'Unpair this device? Your local data stays on this phone, but you will need the passphrase again to resume sync.',
    );
    if (!ok) return;
    clearStoredPairing();
    onUnpair();
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
          Names sync to your partner&rsquo;s phone via Yjs.
        </p>
      </section>

      <section className="card flex flex-col gap-3 p-4">
        <h2 className="font-semibold">Backup &amp; restore</h2>
        <button className="btn-primary" onClick={exportNow}>
          Export JSON backup
        </button>
        <div className="flex flex-col gap-2">
          <label className="label">Import strategy</label>
          <select
            className="input"
            value={importMode}
            onChange={(e) => setImportMode(e.target.value as ImportMode)}
          >
            <option value="merge-yjs">Merge (Yjs CRDT — safest)</option>
            <option value="merge-records">Merge by record ID</option>
            <option value="replace">Replace all entries</option>
          </select>
          <button className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={pickImport}>
            Import JSON file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={onFile}
          />
        </div>
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

      {message && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
          {message}
        </div>
      )}
    </div>
  );
}
