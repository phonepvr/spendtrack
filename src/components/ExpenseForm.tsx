import { useEffect, useState } from 'react';
import {
  CATEGORIES,
  CURRENCIES,
  type Category,
  type Currency,
  type Expense,
  type Settings,
  type SplitMode,
  type UserId,
} from '../lib/schema';
import { defaultEqualShares, round2 } from '../lib/balance';
import { todayIso } from '../lib/format';

interface Props {
  initial?: Expense | null;
  settings: Settings;
  onCancel: () => void;
  onSubmit: (e: Expense) => void;
  onDelete?: () => void;
}

export function ExpenseForm({ initial, settings, onCancel, onSubmit, onDelete }: Props) {
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [payer, setPayer] = useState<UserId>(initial?.payer ?? settings.selfId);
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [category, setCategory] = useState<Category>(initial?.category ?? 'food');
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? settings.primaryCurrency);
  const [splitMode, setSplitMode] = useState<SplitMode>(initial?.splitMode ?? 'equal');
  const [shareAStr, setShareAStr] = useState(initial?.shares.A != null ? String(initial.shares.A) : '');
  const [shareBStr, setShareBStr] = useState(initial?.shares.B != null ? String(initial.shares.B) : '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (splitMode === 'equal') {
      const n = Number(amount);
      if (Number.isFinite(n) && n > 0) {
        const { A, B } = defaultEqualShares(n);
        setShareAStr(String(A));
        setShareBStr(String(B));
      }
    }
  }, [amount, splitMode]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError('Amount must be a positive number.');
      return;
    }
    if (!description.trim()) {
      setError('Description is required.');
      return;
    }
    let shares: { A: number; B: number };
    if (splitMode === 'equal') {
      shares = defaultEqualShares(n);
    } else {
      const a = Number(shareAStr);
      const b = Number(shareBStr);
      if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) {
        setError('Custom shares must be non-negative numbers.');
        return;
      }
      if (Math.abs(round2(a + b) - round2(n)) > 0.01) {
        setError(`Custom shares must add up to ${n.toFixed(2)} (currently ${(a + b).toFixed(2)}).`);
        return;
      }
      shares = { A: round2(a), B: round2(b) };
    }
    const now = Date.now();
    const out: Expense = {
      id: initial?.id ?? cryptoRandomId(),
      amount: round2(n),
      currency,
      description: description.trim(),
      payer,
      date,
      category,
      splitMode,
      shares,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    onSubmit(out);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label className="label">Amount</label>
        <div className="mt-1 flex gap-2">
          <select
            className="input w-24"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            className="input flex-1"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
          />
        </div>
      </div>

      <div>
        <label className="label">Description</label>
        <input
          className="input mt-1"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Groceries, rent, dinner..."
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Date</label>
          <input
            className="input mt-1"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Category</label>
          <select
            className="input mt-1"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Paid by</label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {(['A', 'B'] as UserId[]).map((u) => (
            <button
              key={u}
              type="button"
              className={`btn ${payer === u ? 'btn-primary' : 'btn-ghost border border-slate-300 dark:border-slate-700'}`}
              onClick={() => setPayer(u)}
            >
              {settings.labels[u]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Split</label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {(['equal', 'custom'] as SplitMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`btn ${splitMode === m ? 'btn-primary' : 'btn-ghost border border-slate-300 dark:border-slate-700'}`}
              onClick={() => setSplitMode(m)}
            >
              {m === 'equal' ? '50 / 50' : 'Custom'}
            </button>
          ))}
        </div>
        {splitMode === 'custom' && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="label">{settings.labels.A}&rsquo;s share</label>
              <input
                className="input mt-1"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={shareAStr}
                onChange={(e) => setShareAStr(e.target.value)}
              />
            </div>
            <div>
              <label className="label">{settings.labels.B}&rsquo;s share</label>
              <input
                className="input mt-1"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={shareBStr}
                onChange={(e) => setShareBStr(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-2">
        {onDelete && (
          <button type="button" className="btn-danger" onClick={onDelete}>
            Delete
          </button>
        )}
        <button type="button" className="btn-ghost flex-1" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary flex-1">
          Save
        </button>
      </div>
    </form>
  );
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
