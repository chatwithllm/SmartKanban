import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { ReviewData } from '../types.ts';

type Props = { onClose: () => void };

export function WeeklyReview({ onClose }: Props) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.review().then(setData).catch((e) => setErr(String(e)));
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-neutral-800 bg-neutral-900 p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Weekly review</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-100">
            ✕
          </button>
        </div>
        {err && <div className="text-xs text-red-300">{err}</div>}
        {!data && !err && <div className="text-sm text-neutral-500">Loading…</div>}
        {data && (
          <div className="space-y-6 text-sm">
            {data.summary && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-neutral-200 leading-relaxed">
                {data.summary}
              </div>
            )}
            <Section title={`Shipped (${data.done.length})`} rows={data.done} emptyLabel="Nothing closed this week." />
            <Section
              title={`Stale (${data.stale.length})`}
              rows={data.stale}
              emptyLabel="No stale cards."
            />
            <Section
              title={`Stuck in progress (${data.stuck.length})`}
              rows={data.stuck}
              emptyLabel="Nothing stuck."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: ReviewData['done'];
  emptyLabel: string;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">{title}</h3>
      {rows.length === 0 ? (
        <div className="text-xs text-neutral-600">{emptyLabel}</div>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex gap-2">
              <span className="text-neutral-500">·</span>
              <span className="text-neutral-200">{r.title}</span>
              {r.tags.length > 0 && (
                <span className="text-[10px] text-neutral-500">#{r.tags.join(' #')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
