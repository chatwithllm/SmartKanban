import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { SESSION_COOKIE, userFromMirrorToken, userFromSession } from './auth.js';
import type { Card } from './cards.js';
import type { Template, Visibility } from './templates.js';

export type BroadcastEvent =
  | { type: 'card.created'; card: Card }
  | { type: 'card.updated'; card: Card }
  | { type: 'card.deleted'; id: string }
  | { type: 'template.created'; template: Template }
  | { type: 'template.updated'; template: Template }
  | { type: 'template.deleted'; id: string; owner_id: string; visibility: Visibility };

type Client = { socket: WebSocket; userId: string };
const clients = new Set<Client>();

// A card is visible to `userId` if they created it, are assigned, it's shared
// with them, or it's unassigned (Family Inbox). Matches server's SQL predicate.
function cardVisibleTo(card: Card, userId: string): boolean {
  return (
    card.created_by === userId ||
    card.assignees.includes(userId) ||
    card.shares.includes(userId) ||
    card.assignees.length === 0
  );
}

// A template is visible to `userId` if they own it or it's shared with the family.
// Mirrors `canUserSeeTemplate` in templates.ts.
function templateVisibleTo(t: Template | { owner_id: string; visibility: Visibility }, userId: string): boolean {
  return t.owner_id === userId || t.visibility === 'shared';
}

export function broadcast(ev: BroadcastEvent) {
  for (const c of clients) {
    if (c.socket.readyState !== 1 /* OPEN */) continue;
    if (ev.type === 'card.created' || ev.type === 'card.updated') {
      if (!cardVisibleTo(ev.card, c.userId)) continue;
    }
    if (ev.type === 'template.created' || ev.type === 'template.updated') {
      if (!templateVisibleTo(ev.template, c.userId)) continue;
    }
    if (ev.type === 'template.deleted') {
      if (!templateVisibleTo(ev, c.userId)) continue;
    }
    c.socket.send(JSON.stringify(ev));
  }
}

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export async function wsRoutes(app: FastifyInstance) {
  app.get('/ws', { websocket: true }, async (socket, req) => {
    const cookieHeader = req.headers.cookie;
    const token = parseCookie(cookieHeader, SESSION_COOKIE);
    const url = new URL(req.url, 'http://x');
    const mirrorTok = url.searchParams.get('mirror');

    const user =
      (await userFromSession(token)) ?? (mirrorTok ? await userFromMirrorToken(mirrorTok) : null);
    if (!user) {
      socket.close(4401, 'unauthorized');
      return;
    }

    const client: Client = { socket, userId: user.id };
    clients.add(client);
    socket.send(JSON.stringify({ type: 'hello', user_id: user.id }));
    socket.on('close', () => clients.delete(client));
  });
}
