import { useState } from 'react';
import { api } from '../api.ts';
import { STATUSES, STATUS_LABELS } from '../types.ts';
import type { Status, Template, TemplateVisibility, User } from '../types.ts';
import { useTemplates } from '../hooks/useTemplates.ts';

type Props = { me: User };

type FormState = {
  id: string | null;
  name: string;
  visibility: TemplateVisibility;
  title: string;
  description: string;
  tags: string;
  status: Status;
  dueOffsetDays: string;
};

const empty: FormState = {
  id: null,
  name: '',
  visibility: 'private',
  title: '',
  description: '',
  tags: '',
  status: 'today',
  dueOffsetDays: '',
};

export function TemplatesTab({ me }: Props) {
  const { templates, loading, error } = useTemplates();
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const startNew = () => {
    setErrMsg(null);
    setForm({ ...empty });
  };

  const startEdit = (t: Template) => {
    setErrMsg(null);
    setForm({
      id: t.id,
      name: t.name,
      visibility: t.visibility,
      title: t.title,
      description: t.description,
      tags: t.tags.join(' '),
      status: t.status,
      dueOffsetDays: t.due_offset_days == null ? '' : String(t.due_offset_days),
    });
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setErrMsg(null);
    const tagsArr = form.tags.split(/\s+/).map((t) => t.replace(/^#/, '')).filter(Boolean);
    const payload = {
      name: form.name.trim(),
      visibility: form.visibility,
      title: form.title.trim(),
      description: form.description,
      tags: tagsArr,
      status: form.status,
      due_offset_days: form.dueOffsetDays === '' ? null : Number(form.dueOffsetDays),
    };
    try {
      if (form.id) {
        await api.updateTemplate(form.id, payload as Partial<Template>);
      } else {
        await api.createTemplate(payload);
      }
      setForm(null);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: Template) => {
    if (t.owner_id !== me.id) return;
    if (!confirm(`Delete template "${t.name}"?`)) return;
    setBusy(true);
    setErrMsg(null);
    try {
      await api.deleteTemplate(t.id);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'failed to delete');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="p-4 text-2 tracking-tight2 text-ink-soft">Loading…</div>;
  if (error) return <div className="p-4 text-2 tracking-tight2 text-red">{error}</div>;

  return (
    <section className="bg-gold-lightest rounded-card p-4 -m-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-3 font-semibold text-ink tracking-tight2">Templates</h3>
          <button
            disabled={!!form || busy}
            onClick={startNew}
            className="btn-pill btn-pill-filled-green"
          >
            + New template
          </button>
        </div>

        {form && (
          <div className="card-surface p-4 mb-2">
            {errMsg && <p className="mb-2 text-1 tracking-tight2 text-red">{errMsg}</p>}
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-1 flex flex-col text-1 tracking-tight2 text-ink-soft">
                Name
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 rounded-card border border-ink/10 bg-card px-2 py-1 text-2 tracking-tight2 text-ink"
                />
              </label>
              <label className="col-span-1 flex flex-col text-1 tracking-tight2 text-ink-soft">
                Visibility
                <select
                  value={form.visibility}
                  onChange={(e) =>
                    setForm({ ...form, visibility: e.target.value as TemplateVisibility })
                  }
                  className="mt-1 rounded-card border border-ink/10 bg-card px-2 py-1 text-2 tracking-tight2 text-ink"
                >
                  <option value="private">🔒 Private</option>
                  <option value="shared">👥 Shared</option>
                </select>
              </label>
              <label className="col-span-2 flex flex-col text-1 tracking-tight2 text-ink-soft">
                Title
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="mt-1 rounded-card border border-ink/10 bg-card px-2 py-1 text-2 tracking-tight2 text-ink"
                />
              </label>
              <label className="col-span-2 flex flex-col text-1 tracking-tight2 text-ink-soft">
                Description
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="mt-1 min-h-[60px] rounded-card border border-ink/10 bg-card px-2 py-1 text-2 tracking-tight2 text-ink"
                />
              </label>
              <label className="col-span-2 flex flex-col text-1 tracking-tight2 text-ink-soft">
                Tags (space-separated)
                <input
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  className="mt-1 rounded-card border border-ink/10 bg-card px-2 py-1 text-2 tracking-tight2 text-ink"
                />
              </label>
              <label className="col-span-1 flex flex-col text-1 tracking-tight2 text-ink-soft">
                Status
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
                  className="mt-1 rounded-card border border-ink/10 bg-card px-2 py-1 text-2 tracking-tight2 text-ink"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-1 flex flex-col text-1 tracking-tight2 text-ink-soft">
                Due offset (days, optional)
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={form.dueOffsetDays}
                  onChange={(e) => setForm({ ...form, dueOffsetDays: e.target.value })}
                  className="mt-1 rounded-card border border-ink/10 bg-card px-2 py-1 text-2 tracking-tight2 text-ink"
                />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                disabled={busy}
                onClick={save}
                className="btn-pill btn-pill-filled-green"
              >
                Save
              </button>
              <button
                disabled={busy}
                onClick={() => setForm(null)}
                className="btn-pill btn-pill-outlined-dark"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <ul className="flex flex-col gap-1">
          {templates.length === 0 && (
            <li className="py-3 text-center text-1 tracking-tight2 text-ink-soft">No templates yet.</li>
          )}
          {templates.map((t) => {
            const mine = t.owner_id === me.id;
            return (
              <li
                key={t.id}
                className="card-surface p-4 mb-2 flex items-center justify-between"
              >
                <div className="flex flex-col">
                  <span className="flex items-center gap-2">
                    <span className="text-3 font-semibold text-ink tracking-tight2">{t.name}</span>
                    <span className="tag-pill text-1 tracking-tight2">{t.visibility === 'private' ? '🔒' : '👥'}</span>
                  </span>
                  <span className="text-1 text-ink-soft tracking-tight2">{t.title}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={!mine || busy}
                    onClick={() => startEdit(t)}
                    className="btn-pill btn-pill-outlined-dark disabled:opacity-30"
                  >
                    Edit
                  </button>
                  <button
                    disabled={!mine || busy}
                    onClick={() => remove(t)}
                    className="btn-pill btn-pill-destructive disabled:opacity-30"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
