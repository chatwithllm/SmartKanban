import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Status } from '../types.ts';
import { STATUSES, STATUS_LABELS } from '../types.ts';
import { useTemplates } from '../hooks/useTemplates.ts';

type Props = {
  initialStatus?: Status;
  counts?: Record<Status, number>;
  onCreate: (title: string, status: Status) => Promise<void> | void;
  onCreateFromImage: (file: File, status: Status) => Promise<void> | void;
  onInstantiateTemplate: (id: string, status: Status) => Promise<void> | void;
  onVoiceTodo?: () => void;
  autoFocus?: boolean;
};

const LANE_DOT: Record<Status, string> = {
  backlog:     'rgb(var(--pin-backlog))',
  today:       'rgb(var(--pin-today))',
  in_progress: 'rgb(var(--pin-doing))',
  done:        'rgb(var(--pin-done))',
};

export function CaptureBar({
  initialStatus = 'today',
  counts,
  onCreate,
  onCreateFromImage,
  onInstantiateTemplate,
  onVoiceTodo,
  autoFocus,
}: Props) {
  const [draft, setDraft] = useState('');
  const [target, setTarget] = useState<Status>(initialStatus);
  const [lanePickerOpen, setLanePickerOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { templates } = useTemplates();

  useEffect(() => { setTarget(initialStatus); }, [initialStatus]);
  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  const submit = async () => {
    const t = draft.trim();
    setDraft('');
    if (!t) return;
    if (t.startsWith('/') && !/\s/.test(t)) {
      const name = t.slice(1);
      const tpl = templates.find((tt) => tt.name.toLowerCase() === name.toLowerCase());
      if (tpl) { await onInstantiateTemplate(tpl.id, target); return; }
    }
    await onCreate(t, target);
  };

  const onPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await onCreateFromImage(file, target);
  };

  return (
    <div style={{
      background: 'rgb(var(--surface))',
      border: '1px solid rgb(var(--hairline) / 0.10)',
      borderRadius: 14,
      padding: 10,
      display: 'flex', flexDirection: 'column', gap: 6,
      boxShadow: 'var(--sh-2)',
      width: '100%', boxSizing: 'border-box', minWidth: 0, overflow: 'hidden',
    }}>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPhotoChange}
        style={{ display: 'none' }}
      />

      {/* Target chip + draft + send */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => setLanePickerOpen(true)}
          aria-label="Pick target lane"
          style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgb(var(--hairline) / 0.06)', border: '1px solid rgb(var(--hairline) / 0.12)',
            borderRadius: 999, padding: '4px 10px 4px 6px',
            fontSize: 12, fontWeight: 500, color: 'rgb(var(--ink-2))', cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <span style={{
            display: 'inline-block', width: 10, height: 10, borderRadius: 999,
            background: LANE_DOT[target],
          }} />
          <span>{STATUS_LABELS[target]}</span>
          <span aria-hidden style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
        </button>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="Capture as card…"
          // Mobile Safari auto-zooms inputs with font-size < 16px on focus,
          // which slides fixed-position elements off the right edge. Keep at
          // 16px to prevent the zoom; visually it's still tight enough.
          style={{
            flex: 1, minWidth: 0,
            background: 'transparent', border: 'none', outline: 'none',
            fontSize: 16, color: 'rgb(var(--ink))', fontFamily: 'Inter, sans-serif',
          }}
        />
        <button
          onClick={submit}
          aria-label="Send"
          style={{
            flexShrink: 0, width: 36, height: 36, borderRadius: 999,
            background: draft.trim() ? 'rgb(var(--violet))' : 'rgb(var(--hairline) / 0.12)',
            color: draft.trim() ? 'white' : 'rgb(var(--ink-3))',
            border: 'none', cursor: 'pointer', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 150ms ease, color 150ms ease',
          }}
        >
          →
        </button>
      </div>

      {/* Mode row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <ModeButton onClick={() => photoInputRef.current?.click()} label="Photo" emoji="📷" />
        {templates.length > 0 && (
          <ModeButton onClick={() => setTemplatePickerOpen((v) => !v)} label="Template" emoji="✱" />
        )}
        <ModeButton
          onClick={() => onVoiceTodo?.()}
          label="Voice"
          emoji="🎙️"
          dim
        />
      </div>

      {/* Template popover */}
      {templatePickerOpen && (
        <Sheet onClose={() => setTemplatePickerOpen(false)} title={`Templates → ${STATUS_LABELS[target]}`}>
          {templates.map((tpl) => (
            <SheetRow
              key={tpl.id}
              onClick={async () => {
                setTemplatePickerOpen(false);
                await onInstantiateTemplate(tpl.id, target);
              }}
            >
              {tpl.name}
            </SheetRow>
          ))}
        </Sheet>
      )}

      {/* Lane picker */}
      {lanePickerOpen && (
        <Sheet onClose={() => setLanePickerOpen(false)} title="Save next card to…">
          {STATUSES.map((s) => {
            const active = target === s;
            return (
              <SheetRow
                key={s}
                active={active}
                onClick={() => { setTarget(s); setLanePickerOpen(false); }}
              >
                <span style={{
                  display: 'inline-block', width: 14, height: 14, borderRadius: 999,
                  background: LANE_DOT[s], marginRight: 12,
                }} />
                <span style={{ flex: 1, fontWeight: active ? 600 : 500 }}>{STATUS_LABELS[s]}</span>
                {counts && (
                  <span style={{ fontSize: 13, color: 'rgb(var(--ink-3))', fontFamily: 'JetBrains Mono, monospace' }}>
                    {counts[s]}
                  </span>
                )}
              </SheetRow>
            );
          })}
        </Sheet>
      )}
    </div>
  );
}

function ModeButton({ onClick, label, emoji, dim }: { onClick: () => void; label: string; emoji: string; dim?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: 'rgb(var(--hairline) / 0.04)',
        border: '1px solid rgb(var(--hairline) / 0.08)',
        borderRadius: 999, padding: '4px 10px',
        fontSize: 11, color: 'rgb(var(--ink-2))', cursor: 'pointer',
        fontFamily: 'Inter, sans-serif',
        opacity: dim ? 0.4 : 1,
      }}
    >
      <span>{emoji}</span>
      <span>{label}</span>
    </button>
  );
}

function Sheet({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  // Portal to body so the sheet escapes any fixed/transformed parent
  // container (CaptureBar lives inside a fixed-bottom div on mobile; nesting
  // there caused the sheet to inherit a clipped bounding box on iOS Safari).
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 9999, background: 'rgb(0 0 0 / 0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'rgb(var(--surface))', width: '100%', maxWidth: 480,
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          padding: '18px 12px calc(20px + env(safe-area-inset-bottom))',
          boxShadow: 'var(--sh-3)',
          // dvh adapts to iOS Safari's URL bar so the sheet never clips below
          // the visible area.
          maxHeight: 'calc(85dvh - 40px)',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
      >
        <div style={{ padding: '0 6px 12px', fontSize: 12, fontWeight: 600, color: 'rgb(var(--ink-3))', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {title}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function SheetRow({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left',
        padding: '14px 14px', borderRadius: 12, margin: '2px 0',
        background: active ? 'rgb(var(--hairline) / 0.06)' : 'none',
        border: '1px solid ' + (active ? 'rgb(var(--hairline) / 0.12)' : 'transparent'),
        cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        fontSize: 15, color: 'rgb(var(--ink))',
      }}
    >
      {children}
    </button>
  );
}
