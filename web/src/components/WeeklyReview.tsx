import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { ReviewData } from '../types.ts';

type Props = { onClose: () => void };

export function WeeklyReview({ onClose }: Props) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setErr(null);
    setLoading(true);
    api.review().then(setData).catch((e) => setErr(String(e))).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const stats = data
    ? [
        { label: 'Shipped', value: data.done.length },
        { label: 'Stale', value: data.stale.length },
        { label: 'Stuck', value: data.stuck.length },
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="modal-surface w-full max-w-[560px] max-h-[90vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gold-lightest wash band */}
        <div className="bg-gold-lightest px-6 pt-6 pb-5 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-8 font-normal text-green-starbucks font-serif-rewards leading-tight">
              Weekly review
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="mt-1 text-2 text-ink-soft hover:text-ink shrink-0"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-6">
          {err && <div className="text-1 tracking-tight2 text-red">{err}</div>}
          {!data && !err && (
            <div className="text-3 tracking-tight2 text-ink-soft">Loading…</div>
          )}

          {data && (
            <>
              {/* AI summary */}
              {data.summary && (
                <p className="font-serif-rewards text-3 text-ink-rewards leading-relaxed">
                  {data.summary}
                </p>
              )}

              {/* 3-up stat grid */}
              <div className="grid grid-cols-3 gap-3">
                {stats.map((s) => (
                  <div key={s.label} className="card-surface bg-canvas p-4 text-center">
                    <div className="font-serif-rewards text-9 font-semibold text-green-starbucks leading-none">
                      {s.value}
                    </div>
                    <div className="mt-1 text-1 text-ink-soft tracking-tight2">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Section lists */}
              <div className="flex flex-col gap-5">
                <Section title={`Shipped (${data.done.length})`} rows={data.done} emptyLabel="Nothing closed this week." />
                <Section title={`Stale (${data.stale.length})`} rows={data.stale} emptyLabel="No stale cards." />
                <Section title={`Stuck in progress (${data.stuck.length})`} rows={data.stuck} emptyLabel="Nothing stuck." />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-ink/6 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="btn-pill btn-pill-outlined-green disabled:opacity-50"
          >
            {loading ? 'Generating…' : 'Generate again'}
          </button>
          <button type="button" onClick={onClose} className="btn-pill btn-pill-filled-green">
            Got it
          </button>
        </div>
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
      <h3 className="mb-2 text-1 tracking-tight2 uppercase text-ink-soft">{title}</h3>
      {rows.length === 0 ? (
        <div className="text-1 tracking-tight2 text-ink-soft">{emptyLabel}</div>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.id} className="flex gap-2">
              <span className="text-ink-soft">·</span>
              <span className="text-3 tracking-tight2 text-ink">{r.title}</span>
              {r.tags.length > 0 && (
                <span className="text-1 tracking-tight2 text-ink-soft">#{r.tags.join(' #')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
