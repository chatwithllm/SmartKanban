import { useState } from 'react';
import { api } from '../api.ts';
import type { CardEvent } from '../types.ts';

type Props = { cardId: string; onSent: (event: CardEvent) => void };

export function ChatInput({ cardId, onSent }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    const content = text.trim();
    if (!content) return;
    setBusy(true);
    setErr(null);
    try {
      const ev = await api.postMessage(cardId, content);
      setText('');
      onSent(ev);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      {err && <p className="text-1 text-red mb-1 tracking-tight2">{err}</p>}
      <div className="flex gap-2">
        <input
          className="flex-1 text-2 tracking-tight2 border border-ink/20 rounded px-2 py-1 bg-surface text-ink placeholder:text-ink-soft focus:outline-none focus:border-green-accent"
          placeholder="Message… (type @ai to ask the assistant)"
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          className="px-3 py-1 text-2 tracking-tight2 rounded bg-green-accent text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
          disabled={busy || !text.trim()}
          onClick={() => void send()}
        >
          {busy ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
