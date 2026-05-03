import { useMemo } from 'react';
import type { Card } from '../types.ts';

function activityScore(c: Card): number {
  const ageH = (Date.now() - new Date(c.updated_at).getTime()) / 3_600_000;
  const recency = Math.max(0, 8 - ageH * 0.4);
  return c.attachments.length * 1.5 + recency;
}

function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

const ACCENT: Record<string, string> = {
  backlog:     'backlog',
  today:       'today',
  in_progress: 'doing',
  done:        'done',
};

type Props = {
  cards: Card[];
  onCardClick: (card: Card) => void;
};

export function ActivityTicker({ cards, onCardClick }: Props) {
  const hot = useMemo(() => {
    return [...cards]
      .map(c => ({ c, s: activityScore(c) }))
      .filter(x => x.s >= 1.5)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map(x => x.c);
  }, [cards]);

  if (hot.length === 0) return null;

  const items = [...hot, ...hot];

  return (
    <div className="ticker-wrap">
      <div className="ticker-label">
        <span className="ticker-pulse" aria-hidden="true" />
        <span>Active</span>
        <span className="ticker-count">{hot.length}</span>
      </div>

      <div className="ticker-track">
        <div className="ticker-row">
          {items.map((c, i) => {
            const accent = ACCENT[c.status] ?? 'backlog';
            return (
              <button
                key={c.id + '-' + i}
                className="ticker-chip"
                onClick={() => onCardClick(c)}
                aria-hidden={i >= hot.length}
                tabIndex={i >= hot.length ? -1 : 0}
                style={{ '--chip-accent': `rgb(var(--lane-${accent}))` } as React.CSSProperties}
              >
                <span className="ticker-dot" />
                <span className="ticker-title">{c.title}</span>
                <span className="ticker-sep">·</span>
                <span className="ticker-reason">{relTime(c.updated_at)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <style>{`
        .ticker-wrap {
          position: sticky; top: 57px; z-index: 25;
          display: flex; align-items: stretch;
          background: rgb(var(--surface) / 0.92);
          backdrop-filter: saturate(140%) blur(8px);
          -webkit-backdrop-filter: saturate(140%) blur(8px);
          border-bottom: 1px solid rgb(var(--hairline) / 0.10);
          height: 36px;
          overflow: hidden;
        }
        .ticker-label {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 0 14px;
          background: rgb(var(--violet) / 0.08);
          color: rgb(var(--violet));
          font-weight: 600;
          font-size: 11.5px;
          flex-shrink: 0;
          border-right: 1px solid rgb(var(--hairline) / 0.08);
          white-space: nowrap;
        }
        .ticker-count {
          background: rgb(var(--violet));
          color: white;
          font-size: 9.5px;
          padding: 1px 5px;
          border-radius: 999px;
          font-family: 'JetBrains Mono', monospace;
          font-weight: 600;
          margin-left: 2px;
        }
        .ticker-pulse {
          width: 7px; height: 7px; border-radius: 999px;
          background: rgb(var(--success));
          box-shadow: 0 0 0 0 rgb(var(--success) / 0.6);
          animation: tickerPulse 1.8s ease-out infinite;
          flex-shrink: 0;
        }
        @keyframes tickerPulse {
          0%   { box-shadow: 0 0 0 0 rgb(var(--success) / 0.55); }
          70%  { box-shadow: 0 0 0 7px rgb(var(--success) / 0); }
          100% { box-shadow: 0 0 0 0 rgb(var(--success) / 0); }
        }
        .ticker-track {
          flex: 1; overflow: hidden;
          mask-image: linear-gradient(90deg, transparent 0, black 32px, black calc(100% - 60px), transparent 100%);
          -webkit-mask-image: linear-gradient(90deg, transparent 0, black 32px, black calc(100% - 60px), transparent 100%);
        }
        .ticker-row {
          display: inline-flex; align-items: center;
          gap: 10px; padding: 0 14px; height: 100%;
          white-space: nowrap;
          animation: tickerScroll 60s linear infinite;
        }
        .ticker-wrap:hover .ticker-row { animation-play-state: paused; }
        @keyframes tickerScroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .ticker-chip {
          display: inline-flex; align-items: center; gap: 8px;
          background: transparent;
          border: 1px solid rgb(var(--hairline) / 0.10);
          padding: 5px 11px 5px 9px;
          border-radius: 999px;
          cursor: pointer; color: rgb(var(--ink));
          font-size: 12px; font-family: inherit; flex-shrink: 0;
          transition: background 140ms ease, border-color 140ms ease;
        }
        .ticker-chip:hover { background: var(--chip-accent); border-color: transparent; }
        .ticker-dot {
          width: 6px; height: 6px; border-radius: 999px;
          background: var(--chip-accent); flex-shrink: 0;
          box-shadow: 0 0 0 2px rgb(var(--surface));
        }
        .ticker-title { font-weight: 500; max-width: 280px; overflow: hidden; text-overflow: ellipsis; }
        .ticker-sep { color: rgb(var(--ink-3)); opacity: 0.5; }
        .ticker-reason { font-size: 11.5px; color: rgb(var(--ink-3)); }
      `}</style>
    </div>
  );
}
