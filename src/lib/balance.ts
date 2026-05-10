import type { Currency, Expense, Settlement, UserId } from './schema';
import { partner } from './schema';

export interface BalanceSummary {
  netByCurrency: Record<Currency, number>;
  primaryNet: number;
  primaryCurrency: Currency;
  debtor: UserId | null;
  creditor: UserId | null;
}

export function computeShares(amount: number, splitMode: 'equal' | 'custom', custom: { A: number; B: number }) {
  if (splitMode === 'equal') {
    const half = Math.round(amount * 50) / 100;
    return { A: half, B: Math.round((amount - half) * 100) / 100 };
  }
  return custom;
}

export function defaultEqualShares(amount: number) {
  const half = Math.round(amount * 50) / 100;
  return { A: half, B: Math.round((amount - half) * 100) / 100 };
}

export function netFromExpenses(
  expenses: Expense[],
  settlements: Settlement[],
  self: UserId,
  primaryCurrency: Currency,
): BalanceSummary {
  const net: Record<string, number> = {};
  const other = partner(self);

  for (const e of expenses) {
    const cur = e.currency;
    net[cur] ??= 0;
    if (e.payer === self) {
      net[cur] += e.shares[other];
    } else if (e.payer === other) {
      net[cur] -= e.shares[self];
    }
  }

  for (const s of settlements) {
    const cur = s.currency;
    net[cur] ??= 0;
    if (s.from === other && s.to === self) {
      net[cur] -= s.amount;
    } else if (s.from === self && s.to === other) {
      net[cur] += s.amount;
    }
  }

  const primary = round2(net[primaryCurrency] ?? 0);
  let debtor: UserId | null = null;
  let creditor: UserId | null = null;
  if (primary > 0.005) {
    creditor = self;
    debtor = other;
  } else if (primary < -0.005) {
    creditor = other;
    debtor = self;
  }

  const netByCurrency = Object.fromEntries(
    Object.entries(net).map(([k, v]) => [k, round2(v)]),
  ) as Record<Currency, number>;

  return {
    netByCurrency,
    primaryNet: primary,
    primaryCurrency,
    debtor,
    creditor,
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function totalsByCategory(expenses: Expense[], currency: Currency): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of expenses) {
    if (e.currency !== currency) continue;
    out[e.category] = round2((out[e.category] ?? 0) + e.amount);
  }
  return out;
}

export function totalForMonth(expenses: Expense[], yearMonth: string, currency: Currency): number {
  let sum = 0;
  for (const e of expenses) {
    if (e.currency !== currency) continue;
    if (e.date.startsWith(yearMonth)) sum += e.amount;
  }
  return round2(sum);
}
