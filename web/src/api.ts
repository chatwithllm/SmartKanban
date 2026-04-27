import type { ActivityEntry, ApiToken, Card, KnowledgeItem, KnowledgeVisibility, MirrorToken, ReviewData, Scope, Status, Template, User } from './types.ts';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Server-clock skew: serverNow - clientNow (ms). Updated on every response.
let serverClockSkewMs = 0;
export const getServerClockSkewMs = () => serverClockSkewMs;

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const dateHeader = res.headers.get('date');
  if (dateHeader) {
    const serverMs = Date.parse(dateHeader);
    if (!Number.isNaN(serverMs)) serverClockSkewMs = serverMs - Date.now();
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  me: () => req<User>('/api/auth/me'),
  register: (b: { name: string; short_name: string; email: string; password: string }) =>
    req<User>('/api/auth/register', json(b)),
  login: (b: { email: string; password: string }) => req<User>('/api/auth/login', json(b)),
  logout: () => req<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  updateMe: (b: { short_name?: string; name?: string }) =>
    req<User>('/api/auth/me', { ...json(b), method: 'PATCH' }),

  users: () => req<User[]>('/api/users'),

  listCards: (scope: Scope) => req<Card[]>(`/api/cards?scope=${scope}`),
  createCard: (b: Partial<Card> & { title: string }) => req<Card>('/api/cards', json(b)),
  updateCard: (id: string, b: Partial<Card>) =>
    req<Card>(`/api/cards/${id}`, { ...json(b), method: 'PATCH' }),
  deleteCard: (id: string) => req<void>(`/api/cards/${id}`, { method: 'DELETE' }),

  mirrorTokens: () => req<MirrorToken[]>('/api/mirror/tokens'),
  createMirrorToken: (label?: string) =>
    req<{ token: string; label: string; url: string }>('/api/mirror/tokens', json({ label })),
  deleteMirrorToken: (token: string) =>
    req<void>(`/api/mirror/tokens/${token}`, { method: 'DELETE' }),

  apiTokens: () => req<ApiToken[]>('/api/tokens'),
  createApiToken: (label?: string) =>
    req<{ token: string; label: string; scope: 'api' }>('/api/tokens', json({ label })),
  deleteApiToken: (token: string) =>
    req<void>(`/api/tokens/${token}`, { method: 'DELETE' }),

  review: () => req<ReviewData>('/api/review'),

  linkTelegram: (b: { telegram_user_id: number; telegram_username?: string }) =>
    req<{ ok: boolean }>('/api/telegram/link', json(b)),
  listTelegramIdentities: () =>
    req<Array<{ telegram_user_id: number; app_user_id: string; telegram_username: string | null }>>(
      '/api/telegram/identities',
    ),
  unlinkTelegram: (id: number) =>
    req<void>(`/api/telegram/identities/${id}`, { method: 'DELETE' }),

  attachmentUrl: (path: string) => `/attachments/${path}`,

  getCard: (id: string) => req<Card>(`/api/cards/${id}`),
  cardQrUrl: (id: string) => `/api/cards/${id}/qr.svg`,

  uploadAttachment: async (cardId: string, file: File): Promise<Card> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/cards/${cardId}/attachments`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    });
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try { const b = await res.json(); if (b?.error) msg = b.error; } catch {}
      throw new ApiError(res.status, msg);
    }
    return res.json();
  },

  createCardFromImage: async (file: File, status?: Status): Promise<Card> => {
    const fd = new FormData();
    fd.append('file', file);
    if (status) fd.append('status', status);
    const res = await fetch('/api/cards/from-image', {
      method: 'POST',
      credentials: 'include',
      body: fd,
    });
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try { const b = await res.json(); if (b?.error) msg = b.error; } catch {}
      throw new ApiError(res.status, msg);
    }
    return res.json();
  },

  listArchived: () => req<Card[]>('/api/cards/archived'),
  restoreCard: (id: string) =>
    req<Card>(`/api/cards/${id}/restore`, { method: 'PATCH' }),
  permanentDeleteCard: (id: string) =>
    req<void>(`/api/cards/${id}/permanent`, { method: 'DELETE' }),
  purgeArchived: () => req<{ deleted: number }>('/api/cards/archived/purge', json({})),
  cardActivity: (id: string) => req<ActivityEntry[]>(`/api/cards/${id}/activity`),

  moveCard: (id: string, status: Status, position: number) =>
    api.updateCard(id, { status, position } as Partial<Card>),

  listKnowledge: (params: { scope?: 'mine' | 'inbox' | 'all'; q?: string; tag?: string; cursor?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.scope) qs.set('scope', params.scope);
    if (params.q) qs.set('q', params.q);
    if (params.tag) qs.set('tag', params.tag);
    if (params.cursor) qs.set('cursor', params.cursor);
    return req<{ items: KnowledgeItem[]; next_cursor: string | null }>(
      `/api/knowledge?${qs.toString()}`,
    );
  },
  getKnowledge: (id: string) => req<KnowledgeItem>(`/api/knowledge/${id}`),
  createKnowledge: (b: {
    title: string;
    title_auto?: boolean;
    url?: string | null;
    body?: string;
    tags?: string[];
    visibility: KnowledgeVisibility;
    shares?: string[];
    auto_fetch?: boolean;
  }) => req<KnowledgeItem>('/api/knowledge', json(b)),
  updateKnowledge: (id: string, b: Partial<KnowledgeItem>) =>
    req<KnowledgeItem>(`/api/knowledge/${id}`, { ...json(b), method: 'PATCH' }),
  archiveKnowledge: (id: string) => req<void>(`/api/knowledge/${id}`, { method: 'DELETE' }),
  refetchKnowledge: (id: string) =>
    req<{ queued: boolean }>(`/api/knowledge/${id}/refetch`, { method: 'POST' }),
  linkKnowledge: (id: string, cardId: string) =>
    req<void>(`/api/knowledge/${id}/links`, json({ card_id: cardId })),
  unlinkKnowledge: (id: string, cardId: string) =>
    req<void>(`/api/knowledge/${id}/links/${cardId}`, { method: 'DELETE' }),
  listKnowledgeForCard: (cardId: string) =>
    req<{ items: KnowledgeItem[] }>(`/api/cards/${cardId}/knowledge`).then(r => r.items),
  createKnowledgeFromCard: (cardId: string) =>
    req<KnowledgeItem>(`/api/knowledge/from-card/${cardId}`, { method: 'POST' }),

  listTemplates: () => req<Template[]>('/api/templates'),
  createTemplate: (b: {
    name: string;
    visibility: 'private' | 'shared';
    title: string;
    description?: string;
    tags?: string[];
    status?: Status;
    due_offset_days?: number | null;
  }) => req<Template>('/api/templates', json(b)),
  updateTemplate: (id: string, b: Partial<Template>) =>
    req<Template>(`/api/templates/${id}`, { ...json(b), method: 'PATCH' }),
  deleteTemplate: (id: string) => req<void>(`/api/templates/${id}`, { method: 'DELETE' }),
  instantiateTemplate: (id: string, body?: { status_override?: Status }) =>
    req<Card>(`/api/templates/${id}/instantiate`, json(body ?? {})),
};
