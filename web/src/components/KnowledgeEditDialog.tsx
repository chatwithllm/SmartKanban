import { useState } from 'react';
import type { KnowledgeItem, KnowledgeVisibility } from '../types.ts';
import { api } from '../api.ts';

export type Initial = Partial<KnowledgeItem>;

export function KnowledgeEditDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Initial;
  onClose: () => void;
  onSaved: (k: KnowledgeItem) => void;
}) {
  const [url, setUrl] = useState(initial?.url ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [titleAuto, setTitleAuto] = useState(initial?.title_auto ?? false);
  const [body, setBody] = useState(initial?.body ?? '');
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(' '));
  const [visibility, setVisibility] = useState<KnowledgeVisibility>(initial?.visibility ?? 'private');
  const [autoFetch, setAutoFetch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function onUrlChange(v: string) {
    setUrl(v);
    if (!title.trim() && v) {
      try {
        const h = new URL(v).hostname;
        setTitle(h);
        setTitleAuto(true);
      } catch { /* ignore */ }
    }
  }

  function onTitleChange(v: string) {
    setTitle(v);
    if (titleAuto) setTitleAuto(false);
  }

  const canSave = !busy && title.trim().length > 0 && (url.trim().length > 0 || body.trim().length > 0);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const tags = tagsText.split(/\s+/).map((t) => t.replace(/^#/, '').toLowerCase()).filter(Boolean);
      const payload = {
        title: title.trim(),
        title_auto: titleAuto,
        url: url.trim() || null,
        body,
        tags,
        visibility,
        auto_fetch: autoFetch,
      };
      const k = initial?.id
        ? await api.updateKnowledge(initial.id, payload as Partial<KnowledgeItem>)
        : await api.createKnowledge(payload);
      onSaved(k);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="modal-surface w-full max-w-[560px] max-h-[90vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header strip */}
        <div className="modal-header-strip flex items-center justify-between px-5 py-3 shrink-0">
          <span className="text-3 font-semibold tracking-tight2 text-white">
            {initial?.id ? 'Edit' : 'New'} knowledge
          </span>
          <button onClick={onClose} aria-label="Close" className="text-2 text-white/80 hover:text-white">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-1 tracking-tight2 text-ink-soft">URL</span>
            <input
              type="url"
              className="bg-card border border-ink/10 rounded-card px-3 py-2 text-3 text-ink tracking-tight2 placeholder:text-ink-soft focus:border-green-accent focus:outline-none w-full"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-1 tracking-tight2 text-ink-soft">Title</span>
            <input
              type="text"
              className="bg-card border border-ink/10 rounded-card px-3 py-2 text-3 text-ink tracking-tight2 placeholder:text-ink-soft focus:border-green-accent focus:outline-none w-full"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-1 tracking-tight2 text-ink-soft">Body</span>
            <textarea
              rows={12}
              className="bg-card border border-ink/10 rounded-card px-3 py-2 text-3 text-ink tracking-tight2 placeholder:text-ink-soft focus:border-green-accent focus:outline-none w-full font-mono resize-none"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-1 tracking-tight2 text-ink-soft">Tags (space-separated)</span>
            <input
              type="text"
              className="bg-card border border-ink/10 rounded-card px-3 py-2 text-3 text-ink tracking-tight2 placeholder:text-ink-soft focus:border-green-accent focus:outline-none w-full"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
            />
          </label>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-1 tracking-tight2 text-ink-soft mb-1">Visibility</legend>
            <div className="flex gap-4">
              {(['private', 'inbox', 'shared'] as const).map((v) => (
                <label key={v} className="inline-flex items-center gap-1.5 text-3 tracking-tight2 text-ink cursor-pointer">
                  <input
                    type="radio"
                    name="vis"
                    checked={visibility === v}
                    onChange={() => setVisibility(v)}
                  />
                  <span>{v}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="inline-flex items-center gap-2 text-3 tracking-tight2 text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={autoFetch}
              onChange={(e) => setAutoFetch(e.target.checked)}
            />
            Auto-fetch when I save
          </label>

          {err && <div className="text-1 tracking-tight2 text-red">{err}</div>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-ink/6 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="btn-pill btn-pill-outlined-dark">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className="btn-pill btn-pill-filled-green disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
