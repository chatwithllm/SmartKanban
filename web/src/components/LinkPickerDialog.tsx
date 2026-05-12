import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Card, CardLinkLabel } from '../types.ts';
import { CARD_LINK_LABELS } from '../types.ts';

type Props = {
  fromCardId: string;
  excludeIds: string[];
  onClose: () => void;
  onCreated: () => void;
};

const LABEL_LABEL: Record<CardLinkLabel, string> = {
  evolves_from: '🌱 Evolves from',
  supersedes:   '➡️ Supersedes',
  split_from:   '✂️ Split from',
  related:      '🔗 Related',
  inspired_by:  '💡 Inspired by',
  duplicate_of: '👯 Duplicate of',
};

export function LinkPickerDialog({ fromCardId, excludeIds, onClose, onCreated }: Props) {
  const [step, setStep] = useState<'pick' | 'label'>('pick');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Card[]>([]);
  const [target, setTarget] = useState<Card | null>(null);
  const [label, setLabel] = useState<CardLinkLabel>('related');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await api.listCards('all');
        if (cancelled) return;
        const filtered = all.filter((c) => !excludeIds.includes(c.id));
        const q = query.trim().toLowerCase();
        const matched = q
          ? filtered.filter((c) =>
              (c.title || '').toLowerCase().includes(q) ||
              (c.description || '').toLowerCase().includes(q),
            )
          : filtered;
        setResults(matched.slice(0, 10));
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'failed');
      }
    })();
    return () => { cancelled = true; };
  }, [query, excludeIds]);

  async function save() {
    if (!target) return;
    setSubmitting(true);
    setErr(null);
    try {
      await api.linkCards(fromCardId, { to_card_id: target.id, label, note: note || undefined });
      onCreated();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="modal-surface w-full max-w-[520px] max-h-[80vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-strip flex items-center justify-between px-5 py-3 shrink-0">
          <span className="text-2 font-semibold text-ink-rev tracking-tight2">
            {step === 'pick' ? 'Pick a card to link to' : `Link to "${target?.title}"`}
          </span>
          <button onClick={onClose} aria-label="Close" className="text-2 text-ink-rev/80 hover:text-ink-rev">✕</button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          {step === 'pick' && (
            <>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search cards by title or description…"
                className="input-pill"
              />
              {results.length === 0 ? (
                <p className="text-2 text-ink-soft tracking-tight2">No cards match.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {results.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => { setTarget(c); setStep('label'); }}
                        className="card-surface w-full text-left p-2 hover:bg-surface-2"
                      >
                        <div className="text-2 font-medium text-ink tracking-tight2">{c.title}</div>
                        {c.description && (
                          <div className="text-1 text-ink-soft line-clamp-1 tracking-tight2">{c.description}</div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {step === 'label' && target && (
            <>
              <label className="text-2 text-ink tracking-tight2">Relationship</label>
              <select
                value={label}
                onChange={(e) => setLabel(e.target.value as CardLinkLabel)}
                className="input-pill"
              >
                {CARD_LINK_LABELS.map((l) => (
                  <option key={l} value={l}>{LABEL_LABEL[l]}</option>
                ))}
              </select>

              <label className="text-2 text-ink tracking-tight2 mt-2">Note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="Why are these linked?"
                className="card-surface p-2 text-2 text-ink tracking-tight2 resize-none"
              />

              {err && <p className="text-1 text-red tracking-tight2">{err}</p>}

              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => setStep('pick')} className="btn-pill btn-pill-outlined-dark text-2">Back</button>
                <button onClick={save} disabled={submitting} className="btn-pill btn-pill-filled-green text-2">
                  {submitting ? 'Saving…' : 'Save link'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
