import { useState } from 'react';
import { api } from '../api.ts';
import { useInsights } from '../hooks/useInsights.ts';
import type { Insight } from '../types.ts';

type Props = {
  cardId: string;
  onOpenCard?: (id: string) => void;
  onOpenKnowledge?: (id: string) => void;
};

function LinkActions({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore — clipboard may be denied
    }
  };
  return (
    <span className="inline-flex items-center gap-1 ml-2 align-middle">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open ${label}: ${url}`}
        aria-label={`Open ${label} in new tab`}
        className="btn-pill btn-pill-outlined-green text-1 px-2 py-0 inline-flex items-center gap-0.5"
        style={{ paddingTop: 1, paddingBottom: 1 }}
      >
        Open ↗
      </a>
      <button
        type="button"
        onClick={copy}
        title={`Copy URL: ${url}`}
        aria-label={`Copy ${label} URL`}
        className="btn-pill btn-pill-outlined-green text-1 px-2 py-0 inline-flex items-center gap-0.5"
        style={{ paddingTop: 1, paddingBottom: 1 }}
      >
        {copied ? '✓ Copied' : 'Copy 📋'}
      </button>
    </span>
  );
}

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
                    <span className="text-ink-soft">[{r.kind}]</span>{' '}
                    <span className="font-medium text-ink">{r.title}</span>
                    {r.kind === 'knowledge' && r.url ? (
                      <LinkActions url={r.url} label="knowledge" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (r.kind === 'card') onOpenCard?.(r.id);
                          else onOpenKnowledge?.(r.id);
                        }}
                        className="btn-pill btn-pill-outlined-green text-1 px-2 py-0 ml-2 inline-flex items-center gap-0.5 align-middle"
                        style={{ paddingTop: 1, paddingBottom: 1 }}
                        title={`Open this ${r.kind}`}
                      >
                        Open
                      </button>
                    )}
                    <div className="text-1 text-ink-soft mt-0.5">{r.why}</div>
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
                    <span className="font-medium text-ink">{w.title}</span>
                    <LinkActions url={w.url} label="web result" />
                    <div className="text-1 text-ink-soft mt-0.5">{w.why}</div>
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
