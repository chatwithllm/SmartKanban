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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-2xl">
        <h2 className="mb-3 text-base font-semibold text-neutral-100">
          {initial?.id ? 'Edit' : 'New'} knowledge
        </h2>

        <label className="mb-3 block text-xs text-neutral-400">
          URL
          <input
            type="url"
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-100"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
          />
        </label>

        <label className="mb-3 block text-xs text-neutral-400">
          Title
          <input
            type="text"
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-100"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
          />
        </label>

        <label className="mb-3 block text-xs text-neutral-400">
          Body
          <textarea
            rows={12}
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 font-mono text-xs text-neutral-100"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>

        <label className="mb-3 block text-xs text-neutral-400">
          Tags (space-separated)
          <input
            type="text"
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-100"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
          />
        </label>

        <fieldset className="mb-3 text-xs text-neutral-400">
          <legend>Visibility</legend>
          {(['private', 'inbox', 'shared'] as const).map((v) => (
            <label key={v} className="mr-3 inline-flex items-center gap-1">
              <input
                type="radio"
                name="vis"
                checked={visibility === v}
                onChange={() => setVisibility(v)}
              />
              <span>{v}</span>
            </label>
          ))}
        </fieldset>

        <label className="mb-3 block text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={autoFetch}
            onChange={(e) => setAutoFetch(e.target.checked)}
          />{' '}
          Auto-fetch when I save
        </label>

        {err && <div className="mb-2 text-xs text-red-400">{err}</div>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className="rounded bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-900 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
