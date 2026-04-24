import { useEffect, useState } from 'react';
import type { Card, User } from '../types.ts';

type Props = {
  card: Card;
  users: User[];
  onSave: (patch: Partial<Card>) => void;
  onClose: () => void;
};

export function EditDialog({ card, users, onSave, onClose }: Props) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [tags, setTags] = useState(card.tags.join(', '));
  const [assignees, setAssignees] = useState<string[]>(card.assignees);
  const [shares, setShares] = useState<string[]>(card.shares);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const save = () => {
    onSave({
      title: title.trim() || card.title,
      description,
      tags: tags
        .split(',')
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean),
      assignees,
      shares,
      needs_review: false,
    } as Partial<Card>);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-neutral-800 bg-neutral-900 p-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-transparent text-lg font-medium text-neutral-100 outline-none"
          placeholder="Title"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-3 w-full min-h-[120px] resize-none rounded-lg bg-neutral-950 p-2 text-sm text-neutral-200 outline-none border border-neutral-800 focus:border-neutral-700"
          placeholder="Description"
        />
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className="mt-3 w-full rounded-lg bg-neutral-950 px-2 py-1.5 text-sm text-neutral-200 outline-none border border-neutral-800 focus:border-neutral-700"
          placeholder="tags, comma, separated"
        />

        {card.attachments.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-neutral-500 mb-2">Attachments</div>
            <div className="flex flex-wrap gap-2">
              {card.attachments.map((a) => (
                <a
                  key={a.id}
                  href={`/attachments/${a.storage_path}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-700"
                >
                  {a.kind === 'audio' ? '🎙️ audio' : a.kind === 'image' ? '🖼️ image' : '📎 file'}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-neutral-500 mb-2">Assignees</div>
            <div className="flex flex-wrap gap-1">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => toggle(assignees, setAssignees, u.id)}
                  className={`rounded-full px-2 py-0.5 text-xs border ${
                    assignees.includes(u.id)
                      ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                      : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  {u.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-2">Shared with</div>
            <div className="flex flex-wrap gap-1">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => toggle(shares, setShares, u.id)}
                  className={`rounded-full px-2 py-0.5 text-xs border ${
                    shares.includes(u.id)
                      ? 'bg-sky-200 text-sky-950 border-sky-200'
                      : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  {u.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2 text-sm">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-neutral-400 hover:text-neutral-100"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="rounded bg-neutral-100 px-3 py-1.5 text-neutral-900 hover:bg-white"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
