import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import {
  DEFAULT_SETTINGS,
  type Expense,
  type Settings,
  type Settlement,
  type UserId,
} from './schema';
import type { StoredPairing } from './pairing';

export interface DocBundle {
  doc: Y.Doc;
  expenses: Y.Array<Y.Map<unknown>>;
  settlements: Y.Array<Y.Map<unknown>>;
  settings: Y.Map<unknown>;
  persistence: IndexeddbPersistence;
  destroy: () => Promise<void>;
}

export async function openDoc(pairing: StoredPairing | null): Promise<DocBundle> {
  const doc = new Y.Doc();
  const expenses = doc.getArray<Y.Map<unknown>>('expenses');
  const settlements = doc.getArray<Y.Map<unknown>>('settlements');
  const settings = doc.getMap<unknown>('settings');

  const docName = pairing?.docName ?? 'spendtrack-local';
  const persistence = new IndexeddbPersistence(docName, doc);
  await persistence.whenSynced;

  if (settings.size === 0) {
    doc.transact(() => {
      for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
        settings.set(k, v as unknown);
      }
    });
  }

  const destroy = async () => {
    await persistence.destroy();
    doc.destroy();
  };

  return { doc, expenses, settlements, settings, persistence, destroy };
}

export function readSettings(map: Y.Map<unknown>): Settings {
  const raw: Partial<Settings> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const v = map.get(key);
    if (v !== undefined) (raw as Record<string, unknown>)[key] = v;
  }
  return { ...DEFAULT_SETTINGS, ...raw };
}

export function writeSettings(map: Y.Map<unknown>, patch: Partial<Settings>): void {
  for (const [k, v] of Object.entries(patch)) {
    map.set(k, v as unknown);
  }
}

export function readExpense(m: Y.Map<unknown>): Expense {
  return {
    id: m.get('id') as string,
    amount: m.get('amount') as number,
    currency: m.get('currency') as Expense['currency'],
    description: m.get('description') as string,
    payer: m.get('payer') as UserId,
    date: m.get('date') as string,
    category: m.get('category') as Expense['category'],
    splitMode: m.get('splitMode') as Expense['splitMode'],
    shares: m.get('shares') as Expense['shares'],
    createdAt: m.get('createdAt') as number,
    updatedAt: m.get('updatedAt') as number,
  };
}

export function readSettlement(m: Y.Map<unknown>): Settlement {
  return {
    id: m.get('id') as string,
    amount: m.get('amount') as number,
    currency: m.get('currency') as Settlement['currency'],
    from: m.get('from') as UserId,
    to: m.get('to') as UserId,
    date: m.get('date') as string,
    note: m.get('note') as string,
    createdAt: m.get('createdAt') as number,
    updatedAt: m.get('updatedAt') as number,
  };
}

export function writeExpense(m: Y.Map<unknown>, e: Expense): void {
  m.set('id', e.id);
  m.set('amount', e.amount);
  m.set('currency', e.currency);
  m.set('description', e.description);
  m.set('payer', e.payer);
  m.set('date', e.date);
  m.set('category', e.category);
  m.set('splitMode', e.splitMode);
  m.set('shares', e.shares);
  m.set('createdAt', e.createdAt);
  m.set('updatedAt', e.updatedAt);
}

export function writeSettlement(m: Y.Map<unknown>, s: Settlement): void {
  m.set('id', s.id);
  m.set('amount', s.amount);
  m.set('currency', s.currency);
  m.set('from', s.from);
  m.set('to', s.to);
  m.set('date', s.date);
  m.set('note', s.note);
  m.set('createdAt', s.createdAt);
  m.set('updatedAt', s.updatedAt);
}

export function findIndexById(arr: Y.Array<Y.Map<unknown>>, id: string): number {
  for (let i = 0; i < arr.length; i++) {
    if (arr.get(i).get('id') === id) return i;
  }
  return -1;
}
