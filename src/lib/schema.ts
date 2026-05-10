export type UserId = 'A' | 'B';

export const CATEGORIES = ['food', 'rent', 'travel', 'utilities', 'groceries', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CURRENCIES = ['INR', 'USD', 'EUR'] as const;
export type Currency = (typeof CURRENCIES)[number];

export type SplitMode = 'equal' | 'custom';

export interface ExpenseShares {
  A: number;
  B: number;
}

export interface Expense {
  id: string;
  amount: number;
  currency: Currency;
  description: string;
  payer: UserId;
  date: string;
  category: Category;
  splitMode: SplitMode;
  shares: ExpenseShares;
  createdAt: number;
  updatedAt: number;
}

export interface Settlement {
  id: string;
  amount: number;
  currency: Currency;
  from: UserId;
  to: UserId;
  date: string;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserLabels {
  A: string;
  B: string;
}

export interface Settings {
  selfId: UserId;
  labels: UserLabels;
  primaryCurrency: Currency;
  paired: boolean;
  pairingCreatedAt: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  selfId: 'A',
  labels: { A: 'Me', B: 'Partner' },
  primaryCurrency: 'INR',
  paired: false,
  pairingCreatedAt: null,
};

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function partner(self: UserId): UserId {
  return self === 'A' ? 'B' : 'A';
}
