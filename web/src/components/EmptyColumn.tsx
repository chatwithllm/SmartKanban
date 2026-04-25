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
        <p className="text-center text-xs text-neutral-500">No matching cards</p>
      </div>
    );
  }

  const msg = MESSAGES[status];

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="text-center">
        <p className="text-xs font-medium text-neutral-500">{msg.title}</p>
        <p className="mt-1 text-xs text-neutral-600">{msg.hint}</p>
      </div>
    </div>
  );
}
