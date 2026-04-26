import type { Status } from '../types.ts';

const MESSAGES: Record<Status, { title: string; hint: string }> = {
  backlog: { title: 'No items in backlog', hint: 'Click + to capture ideas and tasks for later' },
  today: { title: 'Nothing planned for today', hint: 'Drag cards here to plan your day' },
  in_progress: { title: 'Nothing in progress', hint: 'Move a card here when you start working on it' },
  done: { title: 'No completed tasks', hint: 'Cards you finish will appear here' },
};

type Props = {
  status: Status;
  searchActive?: boolean;
};

export function EmptyColumn({ status, searchActive }: Props) {
  if (searchActive) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-center text-2 text-ink-soft tracking-tight2">No matching cards</p>
      </div>
    );
  }

  const msg = MESSAGES[status];

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="rounded-card border border-dashed border-ink/20 bg-ceramic px-6 py-8 text-center w-full">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="mx-auto h-8 w-8 text-ink-soft"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M5 8h12l-1 11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 8z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
          <path d="M17 11h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" />
        </svg>
        <p className="mt-2 text-2 font-semibold text-ink tracking-tight2">{msg.title}</p>
        <p className="mt-1 text-1 text-ink-soft tracking-tight2">{msg.hint}</p>
      </div>
    </div>
  );
}
