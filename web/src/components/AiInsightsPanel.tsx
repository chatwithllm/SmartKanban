import { useState } from 'react';
import { api } from '../api.ts';
import { useInsights } from '../hooks/useInsights.ts';
import type { Insight } from '../types.ts';

type Props = {
  cardId: string;
  onOpenCard?: (id: string) => void;
  onOpenKnowledge?: (id: string) => void;
};

export function AiInsightsPanel({ cardId, onOpenCard, onOpenKnowledge }: Props) {
  const { insights, loading } = useInsights(cardId);
  const latest: Insight | undefined = insights[0];
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(): Promise<void> {
    setErr(null);
    setSubmitting(true);
    try {
      await api.brainstormCard(cardId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card-surface bg-gold-lightest p-4 my-3" aria-label="AI insights">
      <header className="flex items-center justify-between mb-2">
        <h3 className="text-3 font-semibold text-green-starbucks tracking-tight2">✨ AI Insights</h3>
        {latest && latest.status !== 'pending' && (
          <button
            type="button"
            onClick={run}
            disabled={submitting}
            className="btn-pill btn-pill-outlined-green text-2"
          >
            🔄 Re-run
          </button>
        )}
      </header>

      {!latest && (
        <div className="flex flex-col gap-2 items-start">
          <p className="text-2 text-ink-soft tracking-tight2">
            Hybrid research: related items you have + fresh web findings + suggested next steps.
          </p>
          <button
            type="button"
            onClick={run}
            disabled={submitting || loading}
            className="btn-pill btn-pill-filled-green"
          >
            🤔 Brainstorm this card
          </button>
        </div>
      )}

      {latest?.status === 'pending' && (
        <p className="text-2 text-ink-soft tracking-tight2 animate-pulse">Researching…</p>
      )}

      {latest?.status === 'failed' && (
        <div>
          <p className="text-2 text-red tracking-tight2">
            ⚠ Failed: {latest.error || 'unknown error'}
          </p>
          <button type="button" onClick={run} className="btn-pill btn-pill-outlined-green text-2 mt-2">
            Retry
          </button>
        </div>
      )}

      {latest?.status === 'ok' && latest.body && (
        <div className="flex flex-col gap-3">
          {latest.summary && (
            <p className="text-2 text-ink tracking-tight2">{latest.summary}</p>
          )}

          {latest.degraded && (
            <p className="text-1 text-ink-soft tracking-tight2 italic">
              (web search unavailable — local context only)
            </p>
          )}

          {(latest.body.related_items?.length ?? 0) > 0 && (
            <div>
              <h4 className="text-2 font-semibold text-ink tracking-tight2 mb-1">Related items you have</h4>
              <ul className="flex flex-col gap-1">
                {latest.body.related_items!.map((r) => (
                  <li key={r.id} className="text-2 text-ink tracking-tight2">
                    {r.kind === 'card' ? (
                      onOpenCard ? (
                        <button
                          type="button"
                          onClick={() => onOpenCard(r.id)}
                          className="text-green-accent underline hover:no-underline cursor-pointer"
                          title="Open card"
                        >
                          [card] {r.title}
                        </button>
                      ) : (
                        <a
                          href={`/?card=${encodeURIComponent(r.id)}`}
                          className="text-green-accent underline hover:no-underline"
                          title="Open card"
                        >
                          [card] {r.title} ↗
                        </a>
                      )
                    ) : onOpenKnowledge ? (
                      <button
                        type="button"
                        onClick={() => onOpenKnowledge(r.id)}
                        className="text-green-accent underline hover:no-underline cursor-pointer"
                        title="Open knowledge item"
                      >
                        [knowledge] {r.title}
                      </button>
                    ) : (
                      <a
                        href={`/knowledge/${encodeURIComponent(r.id)}`}
                        className="text-green-accent underline hover:no-underline"
                        title="Open knowledge item"
                      >
                        [knowledge] {r.title} ↗
                      </a>
                    )}
                    <span className="text-ink-soft"> — {r.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(latest.body.web_findings?.length ?? 0) > 0 && (
            <div>
              <h4 className="text-2 font-semibold text-ink tracking-tight2 mb-1">Web findings</h4>
              <ul className="flex flex-col gap-1">
                {latest.body.web_findings!.map((w, i) => (
                  <li key={i} className="text-2 text-ink tracking-tight2">
                    <a
                      href={w.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-accent underline hover:no-underline inline-flex items-center gap-1"
                      title={w.url}
                    >
                      {w.title}
                      <span aria-hidden>↗</span>
                    </a>
                    <span className="text-ink-soft"> — {w.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(latest.body.next_steps?.length ?? 0) > 0 && (
            <div>
              <h4 className="text-2 font-semibold text-ink tracking-tight2 mb-1">Next steps</h4>
              <ol className="list-decimal ml-5 flex flex-col gap-1">
                {latest.body.next_steps!.map((s, i) => (
                  <li key={i} className="text-2 text-ink tracking-tight2">{s}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {err && (
        <p className="text-1 text-red tracking-tight2 mt-2">{err}</p>
      )}
    </section>
  );
}
