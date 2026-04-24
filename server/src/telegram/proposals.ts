import crypto from 'node:crypto';
import type { Proposal as AIProposal } from '../ai/propose.js';

export type PendingProposal = {
  id: string;
  tgUserId: number;
  appUserId: string;
  chatId: number;
  isPrivateChat: boolean;
  original: string;
  proposal: AIProposal;
  links: string[];
  promptMessageId: number | null;
  awaitingEdit: boolean;
  awaitingLinks: boolean;
  createdAt: number;
};

const TTL_MS = 10 * 60 * 1000;

const byId = new Map<string, PendingProposal>();
const byTgUser = new Map<number, string>(); // tg user id -> latest proposal id

function prune() {
  const now = Date.now();
  for (const [id, p] of byId) {
    if (now - p.createdAt > TTL_MS) {
      byId.delete(id);
      if (byTgUser.get(p.tgUserId) === id) byTgUser.delete(p.tgUserId);
    }
  }
}

export function createPending(
  p: Omit<
    PendingProposal,
    'id' | 'createdAt' | 'awaitingEdit' | 'awaitingLinks' | 'links' | 'promptMessageId'
  >,
): PendingProposal {
  prune();
  const id = crypto.randomBytes(6).toString('base64url'); // ~8 chars, fits callback_data
  const full: PendingProposal = {
    ...p,
    id,
    createdAt: Date.now(),
    awaitingEdit: false,
    awaitingLinks: false,
    links: [],
    promptMessageId: null,
  };
  byId.set(id, full);
  byTgUser.set(p.tgUserId, id);
  return full;
}

export function getPending(id: string): PendingProposal | null {
  prune();
  return byId.get(id) ?? null;
}

export function getLatestForUser(tgUserId: number): PendingProposal | null {
  prune();
  const id = byTgUser.get(tgUserId);
  return id ? byId.get(id) ?? null : null;
}

export function updatePending(id: string, patch: Partial<PendingProposal>): void {
  const p = byId.get(id);
  if (!p) return;
  Object.assign(p, patch);
}

export function deletePending(id: string): void {
  const p = byId.get(id);
  if (!p) return;
  byId.delete(id);
  if (byTgUser.get(p.tgUserId) === id) byTgUser.delete(p.tgUserId);
}
