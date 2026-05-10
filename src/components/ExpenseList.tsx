import type { Expense, Settings, Settlement } from '../lib/schema';
import { formatDate, formatMoney } from '../lib/format';

type Item =
  | { kind: 'expense'; data: Expense }
  | { kind: 'settlement'; data: Settlement };

interface Props {
  expenses: Expense[];
  settlements: Settlement[];
  settings: Settings;
  onEditExpense: (e: Expense) => void;
  onEditSettlement: (s: Settlement) => void;
}

const CATEGORY_EMOJI: Record<string, string> = {
  food: '🍽',
  rent: '🏠',
  travel: '✈',
  utilities: '💡',
  groceries: '🛒',
  other: '•',
};

export function ExpenseList({
  expenses,
  settlements,
  settings,
  onEditExpense,
  onEditSettlement,
}: Props) {
  const items: Item[] = [
    ...expenses.map((e) => ({ kind: 'expense' as const, data: e })),
    ...settlements.map((s) => ({ kind: 'settlement' as const, data: s })),
  ].sort((a, b) => {
    const dateCmp = b.data.date.localeCompare(a.data.date);
    if (dateCmp !== 0) return dateCmp;
    return b.data.createdAt - a.data.createdAt;
  });

  if (items.length === 0) {
    return (
      <div className="card p-6 text-center text-sm text-slate-500 dark:text-slate-400">
        No entries yet. Tap the + button to add an expense.
      </div>
    );
  }

  return (
    <ul className="card divide-y divide-slate-200 dark:divide-slate-800">
      {items.map((item) =>
        item.kind === 'expense' ? (
          <ExpenseRow
            key={`e-${item.data.id}`}
            expense={item.data}
            settings={settings}
            onClick={() => onEditExpense(item.data)}
          />
        ) : (
          <SettlementRow
            key={`s-${item.data.id}`}
            settlement={item.data}
            settings={settings}
            onClick={() => onEditSettlement(item.data)}
          />
        ),
      )}
    </ul>
  );
}

function ExpenseRow({
  expense,
  settings,
  onClick,
}: {
  expense: Expense;
  settings: Settings;
  onClick: () => void;
}) {
  const emoji = CATEGORY_EMOJI[expense.category] ?? '•';
  return (
    <li>
      <button
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg dark:bg-slate-800">
          {emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{expense.description}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {settings.labels[expense.payer]} paid · {formatDate(expense.date)}
            {expense.splitMode === 'custom' && ' · custom split'}
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold tabular-nums">{formatMoney(expense.amount, expense.currency)}</div>
        </div>
      </button>
    </li>
  );
}

function SettlementRow({
  settlement,
  settings,
  onClick,
}: {
  settlement: Settlement;
  settings: Settings;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg dark:bg-emerald-900/40">
          ↻
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">
            {settings.labels[settlement.from]} → {settings.labels[settlement.to]}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Settlement · {formatDate(settlement.date)}
            {settlement.note ? ` · ${settlement.note}` : ''}
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatMoney(settlement.amount, settlement.currency)}
          </div>
        </div>
      </button>
    </li>
  );
}
