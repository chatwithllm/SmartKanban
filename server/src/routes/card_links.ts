import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { pool } from '../db.js';
import {
  createLink,
  deleteLink,
  listLinksForCard,
  chainCardIds,
  linksBetween,
  CARD_LINK_LABELS,
  isCardLinkLabel,
  type CardLink,
} from '../card_links.js';
import { loadCard, canUserSeeCard, type Card } from '../cards.js';
import { listInsightsForCard, type Insight } from '../insights.js';
import { broadcast } from '../ws.js';

export async function cardLinkRoutes(app: FastifyInstance) {
  // POST /api/cards/:id/links — create a link from :id to body.to_card_id
  app.post<{ Params: { id: string }; Body: { to_card_id?: string; label?: string; note?: string } }>(
    '/api/cards/:id/links',
    { preHandler: requireUser },
    async (req, reply) => {
      const userId = req.user!.id;
      const fromId = req.params.id;
      const { to_card_id, label, note } = req.body ?? {};

      if (typeof to_card_id !== 'string') {
        return reply.code(400).send({ error: 'to_card_id required' });
      }
      if (!isCardLinkLabel(label)) {
        return reply.code(400).send({ error: 'invalid label', valid: CARD_LINK_LABELS });
      }
      if (fromId === to_card_id) {
        return reply.code(400).send({ error: 'cannot self-link' });
      }

      if (!(await canUserSeeCard(userId, fromId))) {
        return reply.code(403).send({ error: 'from-card not visible' });
      }
      if (!(await canUserSeeCard(userId, to_card_id))) {
        return reply.code(403).send({ error: 'to-card not visible' });
      }

      let link: CardLink;
      try {
        link = await createLink(userId, fromId, to_card_id, label, note ?? null);
      } catch (e) {
        const err = e as { code?: string; message?: string };
        if (err.code === '23505') {
          return reply.code(409).send({ error: 'link already exists' });
        }
        return reply.code(400).send({ error: err.message ?? 'create failed' });
      }

      const fromCard = await loadCard(fromId);
      const toCard = await loadCard(to_card_id);
      broadcast({
        type: 'card.link.created',
        link,
        from_owner_id: fromCard?.created_by ?? '',
        to_owner_id: toCard?.created_by ?? '',
      });

      return reply.code(201).send({ link });
    },
  );

  // DELETE /api/cards/:id/links/:linkId
  app.delete<{ Params: { id: string; linkId: string } }>(
    '/api/cards/:id/links/:linkId',
    { preHandler: requireUser },
    async (req, reply) => {
      const userId = req.user!.id;
      const { id: fromId, linkId } = req.params;

      if (!(await canUserSeeCard(userId, fromId))) {
        return reply.code(403).send({ error: 'forbidden' });
      }

      const { rows } = await pool.query<{ from_card_id: string; to_card_id: string }>(
        `SELECT from_card_id, to_card_id FROM card_links WHERE id = $1`,
        [linkId],
      );
      const row = rows[0];
      if (!row) return reply.code(404).send({ error: 'not found' });
      if (row.from_card_id !== fromId && row.to_card_id !== fromId) {
        return reply.code(403).send({ error: 'linkId not attached to this card' });
      }

      const ok = await deleteLink(userId, linkId);
      if (!ok) return reply.code(404).send({ error: 'not found' });

      const fromCard = await loadCard(row.from_card_id);
      const toCard = await loadCard(row.to_card_id);
      broadcast({
        type: 'card.link.deleted',
        id: linkId,
        from_card_id: row.from_card_id,
        to_card_id: row.to_card_id,
        from_owner_id: fromCard?.created_by ?? '',
        to_owner_id: toCard?.created_by ?? '',
      });

      return reply.code(204).send();
    },
  );

  // GET /api/cards/:id/links — 1-hop, visibility-filtered links + related_cards
  app.get<{ Params: { id: string } }>(
    '/api/cards/:id/links',
    { preHandler: requireUser },
    async (req, reply) => {
      const userId = req.user!.id;
      const cardId = req.params.id;
      if (!(await canUserSeeCard(userId, cardId))) {
        return reply.code(403).send({ error: 'forbidden' });
      }

      const links = await listLinksForCard(userId, cardId);
      const otherIds = Array.from(
        new Set(links.map((l) => (l.from_card_id === cardId ? l.to_card_id : l.from_card_id))),
      );
      const visibleOtherIds: string[] = [];
      for (const id of otherIds) {
        if (await canUserSeeCard(userId, id)) visibleOtherIds.push(id);
      }
      const filteredLinks = links.filter((l) =>
        visibleOtherIds.includes(l.from_card_id === cardId ? l.to_card_id : l.from_card_id),
      );
      const related_cards: Card[] = [];
      for (const id of visibleOtherIds) {
        const c = await loadCard(id);
        if (c) related_cards.push(c);
      }
      return reply.send({ links: filteredLinks, related_cards });
    },
  );

  // GET /api/cards/:id/chain?depth=2 — BFS to depth hops; nodes + edges + insights
  app.get<{ Params: { id: string }; Querystring: { depth?: string } }>(
    '/api/cards/:id/chain',
    { preHandler: requireUser },
    async (req, reply) => {
      const userId = req.user!.id;
      const cardId = req.params.id;
      if (!(await canUserSeeCard(userId, cardId))) {
        return reply.code(403).send({ error: 'forbidden' });
      }

      const rawDepth = Number(req.query.depth ?? 2);
      const depth = Math.max(1, Math.min(6, Number.isFinite(rawDepth) ? Math.floor(rawDepth) : 2));

      const allIds = await chainCardIds(cardId, depth);
      const visibleIds: string[] = [];
      for (const id of allIds) {
        if (await canUserSeeCard(userId, id)) visibleIds.push(id);
      }
      const nodes: Card[] = [];
      for (const id of visibleIds) {
        const c = await loadCard(id);
        if (c) nodes.push(c);
      }
      const edges = await linksBetween(visibleIds);
      const insights: Insight[] = [];
      for (const id of visibleIds) {
        const list = await listInsightsForCard(id, 1);
        const latest = list[0];
        if (latest && latest.status === 'ok') insights.push(latest);
      }
      return reply.send({ nodes, edges, insights });
    },
  );
}
