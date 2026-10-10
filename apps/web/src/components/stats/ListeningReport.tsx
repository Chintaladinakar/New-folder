import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';
import { formatLongDuration } from '../../lib/format';
import { Segmented } from '../ui/Controls';

const PERIODS: { value: string; label: string; days: number }[] = [
  { value: '7', label: '7 days', days: 7 },
  { value: '30', label: '30 days', days: 30 },
  { value: '365', label: 'Year', days: 365 },
];

/**
 * Plays, time and genres over a chosen period: the signed-in account's own, or, for the admin,
 * another account's. `compact` stacks the figures for a narrow space such as a dialog.
 */
export function ListeningReport({ accountId, empty, compact = false }: { accountId?: string; empty: string; compact?: boolean }) {
  const [period, setPeriod] = useState('30');
  const days = PERIODS.find((p) => p.value === period)?.days ?? 30;
  const listening = useQuery({
    queryKey: accountId ? ['account-listening', accountId, days] : ['listening', days],
    queryFn: () => (accountId ? api.accountListening(accountId, days) : api.listening(days)),
    staleTime: 60_000,
  });
  const data = listening.data;
  const topPlays = data?.genres[0]?.plays ?? 1;

  return (
    <div>
      <Segmented value={period} onChange={setPeriod} label="Period" options={PERIODS.map(({ value, label }) => ({ value, label }))} />
      {listening.isLoading ? (
        <p className="mt-5 text-sm text-muted">Loading…</p>
      ) : listening.error ? (
        <p className="mt-5 text-sm text-danger">{listening.error.message}</p>
      ) : !data?.plays ? (
        <p className="mt-5 text-sm text-muted">{empty}</p>
      ) : (
        <div className="mt-6 space-y-6">
          <dl className={`grid grid-cols-2 gap-6 ${compact ? '' : 'sm:grid-cols-3'}`}>
            <div>
              <dt className="text-xs text-muted">Plays</dt>
              <dd className="mt-1 font-display text-4xl leading-none">{data.plays.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Time, about</dt>
              <dd className="mt-1 font-display text-4xl leading-none">{formatLongDuration(data.seconds)}</dd>
            </div>
            {data.artists[0] && (
              <div className={compact ? 'col-span-2' : 'col-span-2 sm:col-span-1'}>
                <dt className="text-xs text-muted">Most played artist</dt>
                <dd className="mt-1 truncate font-display text-4xl leading-none">{data.artists[0].name}</dd>
              </div>
            )}
          </dl>
          <ul className="space-y-3">
            {data.genres.map((genre) => (
              <li key={genre.name}>
                <div className="mb-1.5 flex justify-between gap-3 text-xs">
                  <span className="truncate font-medium">{genre.name}</span>
                  <span className="shrink-0 font-mono tabular-nums text-faint">
                    {genre.plays} · {Math.round((genre.plays / data.plays) * 100)}%
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-fg/10">
                  <div
                    className="h-full origin-left rounded-full bg-accent transition-transform duration-500 ease-out"
                    style={{ transform: `scaleX(${genre.plays / topPlays})` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
