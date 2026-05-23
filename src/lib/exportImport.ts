import * as Y from 'yjs';
import {
  findIndexById,
  readExpense,
  readSettlement,
  writeExpense,
  writeSettlement,
} from './doc';
import type { DocBundle } from './doc';
import type { Expense, Settlement } from './schema';

export interface ExportPayload {
  format: 'spendtrack/v1';
  exportedAt: number;
  expenses: Expense[];
  settlements: Settlement[];
  yjsUpdate: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function exportSnapshot(bundle: DocBundle): ExportPayload {
  const expenses = bundle.expenses.toArray().map(readExpense);
  const settlements = bundle.settlements.toArray().map(readSettlement);
  const update = Y.encodeStateAsUpdate(bundle.doc);
  return {
    format: 'spendtrack/v1',
    exportedAt: Date.now(),
    expenses,
    settlements,
    yjsUpdate: bytesToBase64(update),
  };
}

function buildExportFile(payload: ExportPayload): { file: File; filename: string } {
  const stamp = new Date(payload.exportedAt).toISOString().replace(/[:.]/g, '-');
  const filename = `spendtrack-${stamp}.json`;
  const file = new File([JSON.stringify(payload, null, 2)], filename, {
    type: 'application/json',
  });
  return { file, filename };
}

export function downloadJson(payload: ExportPayload): void {
  const { file, filename } = buildExportFile(payload);
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  markExportSucceeded(payload.exportedAt);
}

export async function shareOrDownload(payload: ExportPayload): Promise<'shared' | 'downloaded'> {
  const { file, filename } = buildExportFile(payload);
  const navAny = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };
  if (navAny.share && navAny.canShare?.({ files: [file] })) {
    try {
      await navAny.share({
        files: [file],
        title: 'Spendtrack backup',
        text: `Spendtrack backup ${filename}`,
      });
      markExportSucceeded(payload.exportedAt);
      return 'shared';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return 'downloaded';
      }
    }
  }
  downloadJson(payload);
  return 'downloaded';
}

const LAST_EXPORT_KEY = 'spendtrack/lastExportAt/v1';

export function getLastExportAt(): number | null {
  const raw = localStorage.getItem(LAST_EXPORT_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function markExportSucceeded(ms: number): void {
  try {
    localStorage.setItem(LAST_EXPORT_KEY, String(ms));
  } catch {
    /* ignore */
  }
}

export type ImportMode = 'merge-yjs' | 'merge-records' | 'replace';

export interface ImportResult {
  added: number;
  updated: number;
  total: number;
}

export function importSnapshot(
  bundle: DocBundle,
  payload: ExportPayload,
  mode: ImportMode,
): ImportResult {
  if (payload.format !== 'spendtrack/v1') {
    throw new Error('Unknown export format: ' + payload.format);
  }

  if (mode === 'merge-yjs' && payload.yjsUpdate) {
    const update = base64ToBytes(payload.yjsUpdate);
    Y.applyUpdate(bundle.doc, update);
    return {
      added: 0,
      updated: 0,
      total: bundle.expenses.length + bundle.settlements.length,
    };
  }

  let added = 0;
  let updated = 0;

  bundle.doc.transact(() => {
    if (mode === 'replace') {
      bundle.expenses.delete(0, bundle.expenses.length);
      bundle.settlements.delete(0, bundle.settlements.length);
    }
    for (const e of payload.expenses) {
      const idx = findIndexById(bundle.expenses, e.id);
      if (idx === -1) {
        const m = new Y.Map<unknown>();
        writeExpense(m, e);
        bundle.expenses.push([m]);
        added++;
      } else {
        writeExpense(bundle.expenses.get(idx), e);
        updated++;
      }
    }
    for (const s of payload.settlements) {
      const idx = findIndexById(bundle.settlements, s.id);
      if (idx === -1) {
        const m = new Y.Map<unknown>();
        writeSettlement(m, s);
        bundle.settlements.push([m]);
        added++;
      } else {
        writeSettlement(bundle.settlements.get(idx), s);
        updated++;
      }
    }
  });

  return { added, updated, total: payload.expenses.length + payload.settlements.length };
}
