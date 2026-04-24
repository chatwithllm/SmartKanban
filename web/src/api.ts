import type { Card, MirrorToken, ReviewData, Scope, Status, User } from './types.ts';

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

  moveCard: (id: string, status: Status, position: number) =>
    api.updateCard(id, { status, position } as Partial<Card>),
};
