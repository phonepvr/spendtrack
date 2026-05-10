import { useState } from 'react';
import {
  CURRENCIES,
  type Currency,
  type Settings,
  type Settlement,
  type UserId,
} from '../lib/schema';
import { partner } from '../lib/schema';
import { round2 } from '../lib/balance';
import { todayIso } from '../lib/format';

interface Props {
  initial?: Settlement | null;
  settings: Settings;
  onCancel: () => void;
  onSubmit: (s: Settlement) => void;
  onDelete?: () => void;
}

export function SettlementForm({ initial, settings, onCancel, onSubmit, onDelete }: Props) {
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [from, setFrom] = useState<UserId>(initial?.from ?? settings.selfId);
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? settings.primaryCurrency);
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError('Amount must be a positive number.');
      return;
    }
    const now = Date.now();
    const out: Settlement = {
      id: initial?.id ?? cryptoRandomId(),
      amount: round2(n),
      currency,
      from,
      to: partner(from),
      date,
      note: note.trim(),
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
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
          />
        </div>
      </div>

      <div>
        <label className="label">Who paid whom</label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {(['A', 'B'] as UserId[]).map((u) => (
            <button
              key={u}
              type="button"
              className={`btn ${from === u ? 'btn-primary' : 'btn-ghost border border-slate-300 dark:border-slate-700'}`}
              onClick={() => setFrom(u)}
            >
              {settings.labels[u]} paid
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {settings.labels[from]} → {settings.labels[partner(from)]}
        </p>
      </div>

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
        <label className="label">Note (optional)</label>
        <input
          className="input mt-1"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="UPI, cash, transfer..."
        />
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
