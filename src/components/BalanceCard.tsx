import type { BalanceSummary } from '../lib/balance';
import type { Settings } from '../lib/schema';
import { formatMoney } from '../lib/format';

interface Props {
  balance: BalanceSummary;
  settings: Settings;
  monthTotal: number;
  monthLabel: string;
}

export function BalanceCard({ balance, settings, monthTotal, monthLabel }: Props) {
  const { primaryNet, primaryCurrency, debtor, creditor } = balance;
  const settled = debtor === null || creditor === null;
  const otherCurrencies = Object.entries(balance.netByCurrency).filter(
    ([cur]) => cur !== primaryCurrency,
  );

  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Running balance
      </div>
      {settled ? (
        <div className="mt-1 text-2xl font-semibold">All settled up</div>
      ) : (
        <div className="mt-1 text-2xl font-semibold">
          {settings.labels[debtor]} owes {settings.labels[creditor]}{' '}
          <span className="text-emerald-600 dark:text-emerald-400">
            {formatMoney(Math.abs(primaryNet), primaryCurrency)}
          </span>
        </div>
      )}
      {otherCurrencies.length > 0 && (
        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Other currencies:{' '}
          {otherCurrencies
            .map(([cur, n]) => `${cur} ${formatMoney(Number(n), cur as never).replace(/^[^0-9-]+/, '')}`)
            .join(', ')}
        </div>
      )}
      <div className="mt-4 border-t border-slate-200 pt-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
        {monthLabel} total: <span className="font-semibold">{formatMoney(monthTotal, primaryCurrency)}</span>
      </div>
    </div>
  );
}
