import type { Toast as ToastType } from '../hooks/useToast.ts';

const levelStyles: Record<string, string> = {
  error: 'border-red-900 bg-red-950/90 text-red-200',
  info: 'border-neutral-700 bg-neutral-900/90 text-neutral-200',
  success: 'border-green-900 bg-green-950/90 text-green-200',
};

type Props = {
  toasts: ToastType[];
  onDismiss: (id: string) => void;
};

export function ToastContainer({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return <div className="fixed bottom-4 right-4 z-50" />;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg border p-3 text-xs shadow-lg flex items-start gap-2 ${levelStyles[t.level] || levelStyles.info}`}
        >
          <span className="flex-1 break-words">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="text-current opacity-60 hover:opacity-100 shrink-0"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
