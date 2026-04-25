export const STATUSES = ['backlog', 'today', 'in_progress', 'done'] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  backlog: 'Backlog',
  today: 'Today',
  in_progress: 'In Progress',
  done: 'Done',
};

export type Source = 'manual' | 'telegram' | 'mirror';

export type Attachment = {
  id: string;
  kind: 'audio' | 'image' | 'file';
  storage_path: string;
  original_filename: string | null;
  created_at: string;
};

export type Card = {
  id: string;
  title: string;
  description: string;
  status: Status;
  tags: string[];
  due_date: string | null;
  source: Source;
  position: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  ai_summarized: boolean;
  needs_review: boolean;
  assignees: string[];
  shares: string[];
  attachments: Attachment[];
};

export type User = { id: string; name: string; short_name: string; email: string };

export type Scope = 'personal' | 'inbox' | 'all';

export type MirrorToken = { token: string; label: string; created_at: string };

export type ReviewData = {
  done: Array<{ id: string; title: string; status: Status; tags: string[]; updated_at: string }>;
  stale: Array<{ id: string; title: string; status: Status; tags: string[]; updated_at: string }>;
  stuck: Array<{ id: string; title: string; status: Status; tags: string[]; updated_at: string }>;
  summary: string | null;
};

export type ActivityEntry = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  card_id: string | null;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
};

export type Toast = {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
};
