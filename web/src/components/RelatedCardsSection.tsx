import { useState } from 'react';
import { useCardLinks } from '../hooks/useCardLinks.ts';
import { api } from '../api.ts';
import type { CardLinkLabel } from '../types.ts';
import { LinkPickerDialog } from './LinkPickerDialog.tsx';

const LABEL_DISPLAY: Record<CardLinkLabel, string> = {
  evolves_from: 'evolves from',
  supersedes:   'supersedes',
  split_from:   'split from',
  related:      'related',
  inspired_by:  'inspired by',
  duplicate_of: 'duplicate of',
};

type Props = {
  cardId: string;
  onOpenCard?: (cardId: string) => void;
};

export function RelatedCardsSection({ cardId, onOpenCard }: Props) {
  const { links, related_cards } = useCardLinks(cardId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const cardById = new Map(related_cards.map((c) => [c.id, c]));
  const excludeIds = [cardId, ...related_cards.map((c) => c.id)];

  async function unlink(linkId: string) {
    if (!confirm('Unlink this card?')) return;
    try {
      await api.unlinkCard(cardId, linkId);
    } catch (e) {
      alert(`Unlink failed: ${e instanceof Error ? e.message : 'error'}`);
    }
  }

  return (
    <section className="card-surface p-3 my-3" aria-label="Related cards">
      <header className="flex items-center justify-between mb-2">
        <h3 className="text-2 font-semibold text-ink tracking-tight2">🧬 Related cards</h3>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="btn-pill btn-pill-outlined-green text-1"
        >
          + Link card
        </button>
      </header>

      {links.length === 0 ? (
        <p className="text-1 text-ink-soft tracking-tight2">No links yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {links.map((l) => {
            const isOutgoing = l.from_card_id === cardId;
            const otherId = isOutgoing ? l.to_card_id : l.from_card_id;
            const other = cardById.get(otherId);
            const arrow = isOutgoing ? '→' : '←';
            return (
              <li key={l.id} className="text-2 text-ink tracking-tight2">
                <span className="text-ink-soft">{LABEL_DISPLAY[l.label]} {arrow}</span>{' '}
                {other ? (
                  <button
                    type="button"
                    onClick={() => onOpenCard?.(other.id)}
                    className="text-green-accent underline hover:no-underline"
                  >
                    {other.title}
                  </button>
                ) : (
                  <span className="text-ink-soft italic">(not visible)</span>
                )}
                <button
                  type="button"
                  onClick={() => unlink(l.id)}
                  className="btn-pill btn-pill-outlined-dark text-1 ml-2 px-2 py-0"
                  style={{ paddingTop: 1, paddingBottom: 1 }}
                >
                  Unlink
                </button>
                {l.note && <div className="text-1 text-ink-soft mt-0.5">note: {l.note}</div>}
              </li>
            );
          })}
        </ul>
      )}

      {pickerOpen && (
        <LinkPickerDialog
          fromCardId={cardId}
          excludeIds={excludeIds}
          onClose={() => setPickerOpen(false)}
          onCreated={() => { /* cache invalidates via WS */ }}
        />
      )}
    </section>
  );
}
