import * as Y from 'yjs';
import {
  findIndexById,
  readExpense,
  readSettlement,
  writeExpense,
  writeSettlement,
} from './doc';
import type { DocBundle } from './doc';
import { deriveFileKey, derivePairingHint } from './pairing';
import type { Expense, Settlement } from './schema';

export interface ExportPayload {
  format: 'spendtrack/v1';
  exportedAt: number;
  expenses: Expense[];
  settlements: Settlement[];
  yjsUpdate: string;
  sourceId?: 'A' | 'B';
}

export interface ExportEnvelope {
  format: 'spendtrack/v1/encrypted';
  iv: string;
  ciphertext: string;
  pairingHint: string;
  exportedAt: number;
  sourceId?: 'A' | 'B';
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

export function exportSnapshot(bundle: DocBundle, sourceId?: 'A' | 'B'): ExportPayload {
  const expenses = bundle.expenses.toArray().map(readExpense);
  const settlements = bundle.settlements.toArray().map(readSettlement);
  const update = Y.encodeStateAsUpdate(bundle.doc);
  return {
    format: 'spendtrack/v1',
    exportedAt: Date.now(),
    expenses,
    settlements,
    yjsUpdate: bytesToBase64(update),
    sourceId,
  };
}

export async function encryptEnvelope(
  payload: ExportPayload,
  passphrase: string,
): Promise<ExportEnvelope> {
  const key = await deriveFileKey(passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const hint = await derivePairingHint(passphrase);
  return {
    format: 'spendtrack/v1/encrypted',
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(cipher)),
    pairingHint: hint,
    exportedAt: payload.exportedAt,
    sourceId: payload.sourceId,
  };
}

export class WrongPairingError extends Error {
  constructor() {
    super('This file isn’t from your pairing partner.');
    this.name = 'WrongPairingError';
  }
}

export class DecryptError extends Error {
  constructor() {
    super('Could not decrypt this file. The passphrase may have changed.');
    this.name = 'DecryptError';
  }
}

export async function decryptEnvelope(
  envelope: ExportEnvelope,
  passphrase: string,
): Promise<ExportPayload> {
  const expectedHint = await derivePairingHint(passphrase);
  if (envelope.pairingHint !== expectedHint) {
    throw new WrongPairingError();
  }
  const key = await deriveFileKey(passphrase);
  try {
    const iv = base64ToBytes(envelope.iv).slice();
    const cipher = base64ToBytes(envelope.ciphertext).slice();
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return JSON.parse(new TextDecoder().decode(plain)) as ExportPayload;
  } catch {
    throw new DecryptError();
  }
}

function buildEnvelopeFile(envelope: ExportEnvelope): { file: File; filename: string } {
  const stamp = new Date(envelope.exportedAt).toISOString().replace(/[:.]/g, '-');
  const filename = `spendtrack-${stamp}.spendtrack`;
  const file = new File([JSON.stringify(envelope)], filename, {
    type: 'application/spendtrack+json',
  });
  return { file, filename };
}

function buildLegacyExportFile(payload: ExportPayload): { file: File; filename: string } {
  const stamp = new Date(payload.exportedAt).toISOString().replace(/[:.]/g, '-');
  const filename = `spendtrack-${stamp}.json`;
  const file = new File([JSON.stringify(payload, null, 2)], filename, {
    type: 'application/json',
  });
  return { file, filename };
}

export function downloadJson(payload: ExportPayload): void {
  const { file, filename } = buildLegacyExportFile(payload);
  triggerDownload(file, filename);
  markExportSucceeded(payload.exportedAt);
}

export async function shareSyncFile(
  payload: ExportPayload,
  passphrase: string,
  partnerName: string,
): Promise<'shared' | 'downloaded'> {
  const envelope = await encryptEnvelope(payload, passphrase);
  const { file, filename } = buildEnvelopeFile(envelope);
  const result = await shareFile(file, filename, {
    title: 'Spendtrack sync',
    text: `Spendtrack update — open this in ${partnerName}’s app to sync.`,
  });
  markSent(payload.exportedAt);
  return result;
}

async function shareFile(
  file: File,
  filename: string,
  meta: { title: string; text: string },
): Promise<'shared' | 'downloaded'> {
  const navAny = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };
  if (navAny.share && navAny.canShare?.({ files: [file] })) {
    try {
      await navAny.share({ files: [file], title: meta.title, text: meta.text });
      return 'shared';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'downloaded';
    }
  }
  triggerDownload(file, filename);
  return 'downloaded';
}

function triggerDownload(file: File, filename: string): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const LAST_EXPORT_KEY = 'spendtrack/lastExportAt/v1';
const LAST_SENT_KEY = 'spendtrack/lastSentAt/v1';
const LAST_RECEIVED_KEY = 'spendtrack/lastReceivedAt/v1';
const PARTNER_LAST_UPDATE_KEY = 'spendtrack/partnerLastUpdateAt/v1';

function readNumber(key: string): number | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

export function getLastExportAt(): number | null {
  return readNumber(LAST_EXPORT_KEY);
}

function markExportSucceeded(ms: number): void {
  writeNumber(LAST_EXPORT_KEY, ms);
}

export function getLastSentAt(): number | null {
  return readNumber(LAST_SENT_KEY);
}

export function getLastReceivedAt(): number | null {
  return readNumber(LAST_RECEIVED_KEY);
}

export function getPartnerLastUpdateAt(): number | null {
  return readNumber(PARTNER_LAST_UPDATE_KEY);
}

function markSent(ms: number): void {
  writeNumber(LAST_SENT_KEY, ms);
}

function markReceived(ms: number, partnerLastUpdateAt: number): void {
  writeNumber(LAST_RECEIVED_KEY, ms);
  writeNumber(PARTNER_LAST_UPDATE_KEY, partnerLastUpdateAt);
}

export type ImportMode = 'merge-yjs' | 'merge-records' | 'replace';

export interface ImportResult {
  added: number;
  updated: number;
  total: number;
}

export function isEnvelope(obj: unknown): obj is ExportEnvelope {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj as { format?: unknown }).format === 'spendtrack/v1/encrypted'
  );
}

export function isExportPayload(obj: unknown): obj is ExportPayload {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj as { format?: unknown }).format === 'spendtrack/v1'
  );
}

export async function importFile(
  bundle: DocBundle,
  raw: string,
  passphrase: string | null,
  mode: ImportMode = 'merge-yjs',
): Promise<ImportResult & { sourceId?: 'A' | 'B' }> {
  const parsed = JSON.parse(raw) as unknown;
  let payload: ExportPayload;
  let viaEnvelope = false;
  if (isEnvelope(parsed)) {
    if (!passphrase) throw new WrongPairingError();
    payload = await decryptEnvelope(parsed, passphrase);
    viaEnvelope = true;
  } else if (isExportPayload(parsed)) {
    payload = parsed;
  } else {
    throw new Error('Unknown file format.');
  }

  const before = bundle.expenses.length + bundle.settlements.length;
  const result = importSnapshot(bundle, payload, mode);
  const after = bundle.expenses.length + bundle.settlements.length;
  const merged = mode === 'merge-yjs' ? { added: after - before, updated: 0, total: after } : result;

  if (viaEnvelope) {
    markReceived(Date.now(), payload.exportedAt);
  }

  return { ...merged, sourceId: payload.sourceId };
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
