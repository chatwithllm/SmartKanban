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

export type ApiToken = { token: string; label: string; created_at: string; scope: 'api' };

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

export type TemplateVisibility = 'private' | 'shared';

export type Template = {
  id: string;
  owner_id: string;
  name: string;
  visibility: TemplateVisibility;
  title: string;
  description: string;
  tags: string[];
  status: Status;
  due_offset_days: number | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeVisibility = 'private' | 'inbox' | 'shared';
export type KnowledgeFetchStatus = 'pending' | 'ok' | 'failed' | 'skipped';
export type KnowledgeSource = 'manual' | 'telegram' | 'share_target' | 'from_card';

export type KnowledgeItem = {
  id: string;
  owner_id: string;
  title: string;
  title_auto: boolean;
  url: string | null;
  body: string;
  tags: string[];
  visibility: KnowledgeVisibility;
  source: KnowledgeSource;
  fetch_status: KnowledgeFetchStatus | null;
  fetch_error: string | null;
  fetched_at: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  shares?: string[];
  linked_card_ids?: string[];
};
