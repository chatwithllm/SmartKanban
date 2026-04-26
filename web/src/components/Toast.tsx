import type { Toast as ToastType } from '../hooks/useToast.ts';

type Props = {
  toasts: ToastType[];
  onDismiss: (id: string) => void;
};

function toastIcon(level: string): { icon: string; colorClass: string } {
  if (level === 'error') return { icon: '!', colorClass: 'text-red' };
  if (level === 'success') return { icon: '✓', colorClass: 'text-green-accent' };
  return { icon: 'i', colorClass: 'text-green-starbucks' };
}

export function ToastContainer({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return <div className="fixed bottom-[72px] md:bottom-4 right-4 z-50" />;

  return (
    <div className="fixed bottom-[72px] md:bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => {
        const { icon, colorClass } = toastIcon(t.level);
        return (
          <div
            key={t.id}
            className="card-surface p-3 px-4 flex items-start gap-3 max-w-sm"
            style={{ boxShadow: 'var(--shadow-toast)', animation: 'slideUp 0.2s ease-out' }}
          >
            <span className={colorClass} aria-hidden>{icon}</span>
            <p className="text-2 text-ink tracking-tight2 flex-1 break-words">{t.message}</p>
            <button
              onClick={() => onDismiss(t.id)}
              className="text-ink-soft opacity-60 hover:opacity-100 shrink-0"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
