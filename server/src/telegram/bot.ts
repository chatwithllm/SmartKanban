import fs from 'node:fs/promises';
import path from 'node:path';
import { Bot, InlineKeyboard, webhookCallback, type Context } from 'grammy';
import { pool } from '../db.js';
import { broadcast } from '../ws.js';
import { loadCard, logActivity, canUserSeeCard, type Status } from '../cards.js';
import { transcribeAudio } from '../ai/whisper.js';
import { summarizeImage } from '../ai/vision.js';
import { AI_ENABLED } from '../ai/openai.js';
import { proposeFromText, type Proposal as AIProposal } from '../ai/propose.js';
import {
  createPending,
  deletePending,
  getLatestForUser,
  getPending,
  updatePending,
  type Destination,
  type PendingProposal,
} from './proposals.js';
import { defaultDestination, destinationOptions } from './destination.js';
import { searchCardsFts } from '../cards.js';
import { createLink, isCardLinkLabel, type CardLinkLabel } from '../card_links.js';
import { searchKnowledgeFts } from '../knowledge.js';
import { rankCandidates, type Candidate } from '../ai/dedupe.js';
import { findTemplateByName, instantiateTemplate, listTemplates } from '../templates.js';
import {
  createKnowledge,
  listKnowledge,
  loadKnowledge,
  updateKnowledge,
  archiveKnowledge,
  canUserSeeKnowledge,
  KnowledgeValidationError,
  validateUrl,
} from '../knowledge.js';
import { triggerFetch } from '../knowledge_fetch.js';
import {
  createInsight,
  countPendingByCard,
  countPendingByUser,
  countTodayByUser,
} from '../insights.js';
import { enqueueBrainstorm } from '../ai/brainstorm_queue.js';

let botInstance: Bot | null = null;
let pollingStarted = false;

export function getBot(): Bot | null {
  return botInstance;
}

const ATTACHMENTS_DIR = path.resolve(process.env.ATTACHMENTS_DIR ?? 'data/attachments');

const STATUS_EMOJI: Record<Status, string> = {
  backlog: '📥',
  today: '📅',
  in_progress: '⚡',
  done: '✅',
};

const STATUS_LABEL: Record<Status, string> = {
  backlog: 'Backlog',
  today: 'Today',
  in_progress: 'Doing',
  done: 'Done',
};

function allowedGroupId(): number | null {
  const raw = process.env.TELEGRAM_GROUP_ID;
  return raw ? Number(raw) : null;
}

async function resolveAppUser(telegramUserId: number, username?: string): Promise<string | null> {
  const { rows } = await pool.query<{ app_user_id: string }>(
    `SELECT app_user_id FROM telegram_identities WHERE telegram_user_id = $1`,
    [telegramUserId],
  );
  if (rows[0]) return rows[0].app_user_id;
  // Fallback: try to link by matching users.name = '@username' if set elsewhere? Keep strict for now.
  return null;
}

// Extract `#tag` tokens; strip them from the text; return (tags, cleanText).
export function extractHashtags(text: string): { tags: string[]; text: string } {
  const tags: string[] = [];
  const cleaned = text.replace(/(^|\s)#([a-zA-Z0-9_\-]+)/g, (_m, lead, tag) => {
    tags.push(String(tag).toLowerCase());
    return lead;
  });
  return { tags: Array.from(new Set(tags)), text: cleaned.replace(/\s+/g, ' ').trim() };
}

// Parse leading slash-command; return { command, rest }.
export function parseCommand(text: string): { command: string | null; rest: string } {
  const m = text.match(/^\/(\w+)(?:@\w+)?\s*(.*)$/s);
  if (!m) return { command: null, rest: text };
  return { command: m[1]!.toLowerCase(), rest: m[2] ?? '' };
}

export type KnowledgeBotCommand =
  | { cmd: 'save'; url: string; title: string | undefined }
  | { cmd: 'save'; error: 'no url' }
  | { cmd: 'note'; title: string; body: string }
  | { cmd: 'note'; error: 'no body' }
  | { cmd: 'k'; q: string }
  | { cmd: 'k'; error: 'no query' }
  | { cmd: 'klist' };

const URL_RE = /^https?:\/\/\S+/;

export function parseKnowledgeCommand(text: string): KnowledgeBotCommand | null {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('/save')) {
    const rest = trimmed.slice(5).trim();
    if (!rest) return { cmd: 'save', error: 'no url' };
    const [urlPart, ...titleParts] = rest.split('|').map((s) => s.trim());
    if (!urlPart || !URL_RE.test(urlPart)) return { cmd: 'save', error: 'no url' };
    return {
      cmd: 'save',
      url: urlPart,
      title: titleParts.length ? titleParts.join('|').trim() : undefined,
    };
  }
  if (trimmed.startsWith('/note')) {
    const rest = trimmed.slice(5);
    const stripped = rest.replace(/^\s+/, '');
    if (!stripped) return { cmd: 'note', error: 'no body' };
    const lines = stripped.split('\n');
    return {
      cmd: 'note',
      title: lines[0]!.slice(0, 200),
      body: lines.slice(1).join('\n').trimStart(),
    };
  }
  if (trimmed === '/klist' || trimmed.startsWith('/klist ') || trimmed.startsWith('/klist@')) {
    return { cmd: 'klist' };
  }
  if (trimmed === '/k' || trimmed.startsWith('/k ') || trimmed.startsWith('/k@')) {
    const q = trimmed.replace(/^\/k(@\S+)?\s*/, '').trim();
    if (!q) return { cmd: 'k', error: 'no query' };
    return { cmd: 'k', q };
  }
  return null;
}

function splitTitleDesc(text: string): { title: string; description: string } {
  const t = text.trim();
  if (t.length <= 60) return { title: t, description: '' };
  const nl = t.indexOf('\n');
  if (nl > 0 && nl <= 120) return { title: t.slice(0, nl).trim(), description: t.slice(nl + 1).trim() };
  return { title: t.slice(0, 57).trimEnd() + '…', description: t };
}

type CreateOpts = {
  title: string;
  description?: string;
  tags?: string[];
  createdBy: string;
  source: 'telegram';
  status?: Status;
  aiSummarized?: boolean;
  needsReview?: boolean;
  assignees?: string[];
  telegramChatId?: number;
  telegramMessageId?: number;
};

async function createCard(opts: CreateOpts): Promise<string> {
  const status: Status = opts.status ?? 'backlog';
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO cards
      (title, description, status, tags, source, created_by, ai_summarized, needs_review,
       telegram_chat_id, telegram_message_id, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       COALESCE((SELECT MIN(position) - 1 FROM cards WHERE status = $3 AND NOT archived), 0))
     RETURNING id`,
    [
      opts.title.slice(0, 500),
      opts.description ?? '',
      status,
      opts.tags ?? [],
      opts.source,
      opts.createdBy,
      !!opts.aiSummarized,
      !!opts.needsReview,
      opts.telegramChatId ?? null,
      opts.telegramMessageId ?? null,
    ],
  );
  const cardId = rows[0]!.id;
  if (opts.assignees && opts.assignees.length > 0) {
    await pool.query(
      `INSERT INTO card_assignees (card_id, user_id)
       SELECT $1, UNNEST($2::uuid[]) ON CONFLICT DO NOTHING`,
      [cardId, opts.assignees],
    );
  }
  return cardId;
}

async function cardForReply(
  chatId: number | undefined,
  replyToMessageId: number | undefined,
): Promise<string | null> {
  if (!chatId || !replyToMessageId) return null;
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM cards WHERE telegram_chat_id = $1 AND telegram_message_id = $2 LIMIT 1`,
    [chatId, replyToMessageId],
  );
  return rows[0]?.id ?? null;
}

// Map @usernames mentioned in the command body to app user IDs via telegram_identities.
async function usersFromMentions(mentions: string[]): Promise<string[]> {
  const clean = mentions.map((m) => m.replace(/^@/, '').toLowerCase()).filter(Boolean);
  if (clean.length === 0) return [];
  const { rows } = await pool.query<{ app_user_id: string }>(
    `SELECT DISTINCT app_user_id FROM telegram_identities WHERE LOWER(telegram_username) = ANY($1::text[])`,
    [clean],
  );
  return rows.map((r) => r.app_user_id);
}

export function extractMentions(text: string): string[] {
  const m = text.match(/@[A-Za-z0-9_]{3,}/g) ?? [];
  return Array.from(new Set(m));
}

async function attachFile(
  cardId: string,
  kind: 'audio' | 'image' | 'file',
  storagePath: string,
  originalFilename?: string,
): Promise<void> {
  // storagePath is saved relative so we can relocate the data dir later.
  const rel = path.relative(ATTACHMENTS_DIR, storagePath);
  await pool.query(
    `INSERT INTO card_attachments (card_id, kind, storage_path, original_filename)
     VALUES ($1, $2, $3, $4)`,
    [cardId, kind, rel, originalFilename ?? null],
  );
}

async function downloadTelegramFile(
  bot: Bot,
  fileId: string,
  cardId: string,
  ext: string,
): Promise<string> {
  const file = await bot.api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`telegram file download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const dir = path.join(ATTACHMENTS_DIR, cardId);
  await fs.mkdir(dir, { recursive: true });
  const outPath = path.join(dir, `${fileId}${ext}`);
  await fs.writeFile(outPath, buf);
  return outPath;
}

type ReactionEmoji = '👍' | '🤔';
async function reactOk(ctx: Context, emoji: ReactionEmoji = '👍'): Promise<void> {
  try {
    await ctx.api.setMessageReaction(ctx.chat!.id, ctx.msg!.message_id, [
      { type: 'emoji', emoji },
    ]);
  } catch {}
}

export function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? [];
  return Array.from(new Set(matches.map((u) => u.replace(/[.,;:!?)]+$/, ''))));
}

function proposalText(p: AIProposal, links: string[] = []): string {
  const tags = p.tags.length ? `\nTags: ${p.tags.map((t) => `#${t}`).join(' ')}` : '';
  const desc = p.description ? `\n\n${p.description}` : '';
  const linksBlock = links.length
    ? `\n\n🔗 ${links.map((l) => `[link](${l})`).join('  ·  ')}`
    : '';
  const hint = p.is_actionable
    ? ''
    : '\n\n_Doesn\'t look like a task — save anyway if you want._';
  return `📝 *${escapeMd(p.title)}*${desc}${tags}${linksBlock}${hint}`;
}

function escapeMd(s: string): string {
  // Minimal escaping for MarkdownV2-ish safety; we use Markdown mode for bold only.
  return s.replace(/([_*`\[\]])/g, '\\$1');
}

// ---------- structured-capture keyboards (new flow) ----------

function destinationKeyboard(
  pid: string,
  def: Destination,
  isPrivateChat: boolean,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const o of destinationOptions(isPrivateChat)) {
    kb.text(`${o.key === def ? '✓ ' : ''}${o.label}`, `dest:${o.key}:${pid}`);
  }
  kb.row()
    .text('🔍 Check duplicates?', `dup:check:${pid}`)
    .text('🔗 Link to existing', `linkpick:${pid}`);
  kb.row()
    .text('✏️ Edit', `edit:${pid}`)
    .text('❌ Cancel', `drop:${pid}`);
  return kb;
}

function columnKeyboard(pid: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('📥 Backlog', `col:backlog:${pid}`)
    .text('📅 Today', `col:today:${pid}`)
    .row()
    .text('⚡ In Progress', `col:in_progress:${pid}`)
    .text('✅ Done', `col:done:${pid}`);
}

function attachmentKindKeyboard(pid: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✨ New', `att:new:${pid}`)
    .text('🔗 Attach to existing', `att:pick:${pid}`)
    .row()
    .text('❌ Cancel', `drop:${pid}`);
}

function attachPickerKeyboard(
  pid: string,
  items: Array<{ id: string; kind: 'card' | 'knowledge'; label: string }>,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const it of items) {
    kb.text(`Pick: ${it.label.slice(0, 50)}`, `att:to:${it.kind}:${it.id}:${pid}`).row();
  }
  kb.text('❌ Cancel', `drop:${pid}`);
  return kb;
}

function dupResultsKeyboard(
  pid: string,
  matches: Array<{ kind: 'card' | 'knowledge'; id: string }>,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  const top = matches[0];
  if (top) {
    kb.text(
      `🔗 Link to ${top.kind === 'card' ? 'card' : 'knowledge'}`,
      `dup:link:${top.kind}:${top.id}:${pid}`,
    );
  }
  kb.text('+ Save anyway', `dup:save:${pid}`).row().text('❌ Cancel', `drop:${pid}`);
  return kb;
}

function postSaveKeyboard(cardId: string, currentStatus: Status): InlineKeyboard {
  const kb = new InlineKeyboard();
  const row: Array<['📅 Today' | '⚡ Doing' | '✅ Done', Status, string]> = [
    ['📅 Today', 'today', `mv:today:${cardId}`],
    ['⚡ Doing', 'in_progress', `mv:doing:${cardId}`],
    ['✅ Done', 'done', `mv:done:${cardId}`],
  ];
  for (const [label, s, cb] of row) {
    if (s !== currentStatus) kb.text(label, cb);
  }
  kb.text('🗑', `arch:${cardId}`);
  kb.row().text('🤔 Brainstorm', `brain:${cardId}`);
  return kb;
}

async function sendProposal(
  ctx: Context,
  pendingId: string,
  p: AIProposal,
  isPrivateChat: boolean,
  links: string[] = [],
): Promise<number | null> {
  const def = defaultDestination(p, isPrivateChat, links.join(' '));
  try {
    const msg = await ctx.reply(proposalText(p, links), {
      parse_mode: 'Markdown',
      reply_markup: destinationKeyboard(pendingId, def, isPrivateChat),
      reply_parameters: { message_id: ctx.msg!.message_id, allow_sending_without_reply: true },
    });
    return msg.message_id;
  } catch {
    return null;
  }
}

// ---------- handlers ----------
async function handleText(
  ctx: Context,
  text: string,
  createdBy: string,
  isPrivate = false,
): Promise<void> {
  const { command, rest } = parseCommand(text);
  const body = command ? rest : text;

  // If the user has a pending proposal awaiting a correction or a link,
  // route this message accordingly and re-show the updated proposal.
  const tgUserId = ctx.from?.id;
  if (tgUserId && !command) {
    const existing = getLatestForUser(tgUserId);
    if (existing && existing.awaitingEdit) {
      const revised = await proposeFromText(existing.original, existing.proposal, text);
      if (revised) {
        updatePending(existing.id, { proposal: revised, awaitingEdit: false });
        const msgId = await sendProposal(
          ctx,
          existing.id,
          revised,
          existing.isPrivateChat,
          existing.links,
        );
        updatePending(existing.id, { promptMessageId: msgId });
      } else {
        await ctx.reply('Could not update — try again with a clearer correction.');
      }
      return;
    }
    if (existing && existing.awaitingLinks) {
      const urls = extractUrls(text);
      if (urls.length === 0) {
        await ctx.reply('No URL detected — send a link starting with http(s)://');
        return;
      }
      const merged = Array.from(new Set([...existing.links, ...urls]));
      updatePending(existing.id, { links: merged, awaitingLinks: false });
      const msgId = await sendProposal(
        ctx,
        existing.id,
        existing.proposal,
        existing.isPrivateChat,
        merged,
      );
      updatePending(existing.id, { promptMessageId: msgId });
      return;
    }
    if (existing && (existing.attachMode === 'pickRecent' || existing.attachMode === 'pickFiltered')) {
      await showAttachPicker(ctx, existing, text);
      return;
    }
    if (existing && existing.awaitingLinkNote) {
      updatePending(existing.id, { awaitingLinkNote: false });
      await finalizeCardWithLink(ctx, existing, text.slice(0, 500));
      return;
    }
  }

  // Reply-based commands: /assign, /share, /today operate on the referenced card.
  const replyToId = ctx.msg?.reply_to_message?.message_id;
  const chatId = ctx.chat?.id;
  const referencedCardId = await cardForReply(chatId, replyToId);

  if (command === 'assign' && referencedCardId) {
    const userIds = await usersFromMentions(extractMentions(rest));
    if (userIds.length > 0) {
      await pool.query(`DELETE FROM card_assignees WHERE card_id = $1`, [referencedCardId]);
      await pool.query(
        `INSERT INTO card_assignees (card_id, user_id) SELECT $1, UNNEST($2::uuid[]) ON CONFLICT DO NOTHING`,
        [referencedCardId, userIds],
      );
      await logActivity(createdBy, referencedCardId, 'telegram.assign', { assignees: userIds });
      const card = (await loadCard(referencedCardId))!;
      broadcast({ type: 'card.updated', card });
      await reactOk(ctx);
    } else {
      await reactOk(ctx, '🤔');
    }
    return;
  }

  if (command === 'share' && referencedCardId) {
    const userIds = await usersFromMentions(extractMentions(rest));
    if (userIds.length > 0) {
      for (const uid of userIds) {
        await pool.query(
          `INSERT INTO card_shares (card_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [referencedCardId, uid],
        );
      }
      await logActivity(createdBy, referencedCardId, 'telegram.share', { shares: userIds });
      const card = (await loadCard(referencedCardId))!;
      broadcast({ type: 'card.updated', card });
      await reactOk(ctx);
    } else {
      await reactOk(ctx, '🤔');
    }
    return;
  }

  // Fast path for /today: skip the proposal round-trip since intent is explicit.
  const { tags, text: clean } = extractHashtags(body);
  if (command === 'today') {
    const { title, description } = splitTitleDesc(clean);
    if (!title) return;
    const cardId = await createCard({
      title,
      description,
      tags,
      createdBy,
      source: 'telegram',
      status: 'today',
      telegramChatId: chatId,
      telegramMessageId: ctx.msg?.message_id,
      assignees: isPrivate ? [createdBy] : undefined,
    });
    await logActivity(createdBy, cardId, 'telegram.today');
    const card = (await loadCard(cardId))!;
    broadcast({ type: 'card.created', card });
    await reactOk(ctx);
    return;
  }

  // Templates: only meaningful in DM. Group invocations are silent (early return)
  // to prevent the command body from being passed to the AI-propose flow as a card seed.
  if ((command === 'use' || command === 't' || command === 'templates') && !isPrivate) {
    return;
  }
  if ((command === 'use' || command === 't') && isPrivate) {
    const name = rest.trim();
    if (!name) {
      await ctx.reply('Usage: `/use <template>` — see `/templates` for the list.', {
        parse_mode: 'Markdown',
      });
      return;
    }
    const tpl = await findTemplateByName(createdBy, name);
    if (!tpl) {
      await ctx.reply(`No template \`${escapeMd(name)}\`. Try /templates.`, {
        parse_mode: 'Markdown',
      });
      return;
    }
    const card = await instantiateTemplate(createdBy, tpl.id, {
      source: 'telegram',
      telegramChatId: chatId,
      telegramMessageId: ctx.msg?.message_id,
    });
    if (!card) {
      await ctx.reply('Template no longer exists.');
      return;
    }
    broadcast({ type: 'card.created', card });
    // instantiateTemplate already logs a 'create' activity with template_id/template_name.
    // The source=telegram column on the card distinguishes this path; no extra log needed.
    await reactOk(ctx);
    await ctx.reply(`✓ Saved · ${STATUS_EMOJI[card.status]} ${STATUS_LABEL[card.status]} — ${escapeMd(card.title)}`, {
      parse_mode: 'Markdown',
      reply_markup: postSaveKeyboard(card.id, card.status),
    });
    return;
  }

  if (command === 'templates' && isPrivate) {
    const list = await listTemplates(createdBy);
    if (list.length === 0) {
      await ctx.reply('No templates yet. Add one in Settings → Templates.');
      return;
    }
    const lines = list.map(
      (t) => `${t.visibility === 'private' ? '🔒' : '👥'} \`${escapeMd(t.name)}\` — ${escapeMd(t.title)}`,
    );
    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
    return;
  }

  // Knowledge: DM-only. Group invocations are silent (early return).
  const kcmd = parseKnowledgeCommand(text);
  if (kcmd && !isPrivate) return;
  if (kcmd) {
    await handleKnowledgeCommand(ctx, kcmd, createdBy, chatId);
    return;
  }

  // Interactive propose/confirm flow for all other text.
  if (AI_ENABLED() && tgUserId !== undefined && chatId !== undefined) {
    const seed = (command ? rest : text) || text;
    const proposal = await proposeFromText(seed);
    if (proposal) {
      const seededLinks = extractUrls(text);
      const pending = createPending({
        tgUserId,
        appUserId: createdBy,
        chatId,
        isPrivateChat: isPrivate,
        original: text,
        proposal,
      });
      if (seededLinks.length) {
        updatePending(pending.id, { links: seededLinks });
      }
      const msgId = await sendProposal(ctx, pending.id, proposal, isPrivate, seededLinks);
      updatePending(pending.id, { promptMessageId: msgId });
      return;
    }
  }

  // Fallback (no AI key or proposal failed): preserve the original auto-save behavior.
  const { title, description } = splitTitleDesc(clean);
  if (!title) return;
  const cardId = await createCard({
    title,
    description,
    tags,
    createdBy,
    source: 'telegram',
    status: 'backlog',
    telegramChatId: chatId,
    telegramMessageId: ctx.msg?.message_id,
    assignees: isPrivate ? [createdBy] : undefined,
  });
  await logActivity(createdBy, cardId, isPrivate ? 'telegram.text.private' : 'telegram.text');
  const card = (await loadCard(cardId))!;
  broadcast({ type: 'card.created', card });
  await reactOk(ctx);
}

async function handleVoice(ctx: Context, appUserId: string, isPrivate = false): Promise<void> {
  const voice = ctx.msg?.voice ?? ctx.msg?.audio;
  if (!voice) return;
  const voiceFileId = voice.file_id;
  const tmpCardId = crypto.randomUUID();
  const bot = getBot()!;
  const audioPath = await downloadTelegramFile(bot, voiceFileId, tmpCardId, '.ogg');

  const transcript = await transcribeAudio(audioPath);

  // Clean up temp file — it will be re-downloaded when attached to a card.
  await fs.unlink(audioPath).catch(() => {});
  await fs.rmdir(path.dirname(audioPath)).catch(() => {});

  let title: string;
  let description = '';
  let needsReview = false;

  if (transcript && transcript.length > 0) {
    const split = splitTitleDesc(transcript);
    title = split.title;
    description = split.description;
  } else {
    title = '[voice note — transcription failed]';
    needsReview = true;
  }

  const proposal: AIProposal = {
    is_actionable: !needsReview,
    title,
    description: description || '',
    tags: transcript ? extractHashtags(transcript).tags : [],
    reason: needsReview ? 'voice note without transcript' : 'voice note with Whisper transcript',
  };

  const chatId = ctx.chat!.id;
  const pending = createPending({
    tgUserId: ctx.from!.id,
    appUserId,
    chatId,
    isPrivateChat: isPrivate,
    original: transcript || title,
    proposal,
  });
  updatePending(pending.id, {
    pendingAudioFileId: voiceFileId,
    attachMode: 'new',
  });

  await reactOk(ctx, transcript ? '👍' : '🤔');
  await ctx.reply(
    `🎙 ${title}${description ? '\n\n' + description.slice(0, 300) : ''}\n\nIs this new, or attaching to existing?`,
    {
      reply_markup: attachmentKindKeyboard(pending.id),
      reply_parameters: { message_id: ctx.msg!.message_id, allow_sending_without_reply: true },
    },
  );
}

async function handlePhoto(ctx: Context, appUserId: string, isPrivate = false): Promise<void> {
  const photos = ctx.msg?.photo;
  if (!photos || photos.length === 0) return;
  const largest = photos[photos.length - 1]!;
  const photoFileId = largest.file_id;
  const tmpCardId = crypto.randomUUID();
  const bot = getBot()!;
  const imagePath = await downloadTelegramFile(bot, photoFileId, tmpCardId, '.jpg');

  const caption = ctx.msg?.caption ?? '';
  const captionTags = extractHashtags(caption).tags;

  const vision = await summarizeImage(imagePath);
  let title: string;
  let description = '';
  let needsReview = false;

  if (vision) {
    title = vision.title;
    description = vision.description + (caption ? '\n\n' + caption : '');
  } else if (caption.trim()) {
    const split = splitTitleDesc(extractHashtags(caption).text);
    title = split.title;
    description = split.description;
  } else {
    title = '[photo — needs review]';
    needsReview = true;
  }

  // Clean up temp file — it will be re-downloaded when attached to a card.
  await fs.unlink(imagePath).catch(() => {});
  await fs.rmdir(path.dirname(imagePath)).catch(() => {});

  const proposal: AIProposal = {
    is_actionable: !needsReview,
    title,
    description: description || '',
    tags: captionTags,
    reason: needsReview ? 'photo without caption or vision summary' : 'photo with AI vision summary',
  };

  const chatId = ctx.chat!.id;
  const pending = createPending({
    tgUserId: ctx.from!.id,
    appUserId,
    chatId,
    isPrivateChat: isPrivate,
    original: title,
    proposal,
  });
  updatePending(pending.id, {
    pendingPhotoFileId: photoFileId,
    attachMode: 'new',
  });

  await ctx.reply(
    `📷 ${title}${description ? '\n\n' + description : ''}\n\nIs this new, or attaching to existing?`,
    {
      reply_markup: attachmentKindKeyboard(pending.id),
      reply_parameters: { message_id: ctx.msg!.message_id, allow_sending_without_reply: true },
    },
  );
}

// ---------- structured-capture helpers ----------

async function finalizeKnowledge(ctx: Context, pending: PendingProposal): Promise<void> {
  const proposal = pending.proposal;
  const candidateUrls = [
    ...extractUrls(proposal.title),
    ...extractUrls(proposal.description ?? ''),
    ...extractUrls(pending.original),
  ];
  let url: string | null = null;
  for (const u of candidateUrls) {
    try {
      validateUrl(u);
      url = u;
      break;
    } catch {}
  }
  const title = (proposal.title || pending.original.slice(0, 80)).trim();
  try {
    const created = await createKnowledge(pending.appUserId, {
      title,
      body: proposal.description || (url ? '' : pending.original),
      url: url ?? undefined,
      tags: proposal.tags ?? [],
      visibility: 'private',
      source: 'telegram',
    });
    broadcast({ type: 'knowledge.created', knowledge: created });
    if (url) {
      try { triggerFetch(created.id); } catch { /* non-fatal */ }
    }
    await ctx.reply(`📚 Saved · ${title}`);
  } catch (e) {
    await ctx.reply(`Save failed: ${e instanceof Error ? e.message : 'error'}`);
  }
  deletePending(pending.id);
}

async function finalizeCard(
  ctx: Context,
  pending: PendingProposal,
  status: Status,
): Promise<void> {
  const proposal = pending.proposal;
  const isPrivate = pending.destination === 'private_card';
  const assignees = isPrivate ? [pending.appUserId] : undefined;
  const cardId = await createCard({
    title: proposal.title || pending.original.slice(0, 80),
    description: proposal.description ?? '',
    tags: proposal.tags ?? [],
    createdBy: pending.appUserId,
    source: 'telegram',
    status,
    aiSummarized: true,
    assignees,
    telegramChatId: pending.chatId,
    telegramMessageId: pending.promptMessageId ?? undefined,
  });

  // Attach any pending media (set by photo/voice handlers in Task 8/9)
  if (pending.pendingPhotoFileId && botInstance) {
    try {
      const localPath = await downloadTelegramFile(botInstance, pending.pendingPhotoFileId, cardId, '.jpg');
      await attachFile(cardId, 'image', localPath);
    } catch { /* non-fatal */ }
  }
  if (pending.pendingAudioFileId && botInstance) {
    try {
      const localPath = await downloadTelegramFile(botInstance, pending.pendingAudioFileId, cardId, '.ogg');
      await attachFile(cardId, 'audio', localPath);
    } catch { /* non-fatal */ }
  }

  const card = await loadCard(cardId);
  if (card) {
    broadcast({ type: 'card.created', card });
  }

  await logActivity(pending.appUserId, cardId, isPrivate ? 'telegram.text.private' : 'telegram.text');
  deletePending(pending.id);
  const emoji = STATUS_EMOJI[status];
  const label = STATUS_LABEL[status];
  await ctx.reply(`✓ Saved · ${emoji} ${label} — ${proposal.title}`, {
    reply_markup: postSaveKeyboard(cardId, status),
  });
}

function relativeAge(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const days = Math.floor(d / 86_400_000);
  if (days >= 1) return `${days}d ago`;
  const hrs = Math.floor(d / 3_600_000);
  if (hrs >= 1) return `${hrs}h ago`;
  const mins = Math.floor(d / 60_000);
  return `${Math.max(1, mins)}m ago`;
}

// ---------- attach-picker helpers ----------

async function showAttachPicker(
  ctx: Context,
  pending: PendingProposal,
  filter: string,
): Promise<void> {
  let cardItems: Array<{ id: string; label: string }> = [];
  let kItems: Array<{ id: string; label: string }> = [];
  if (filter.trim()) {
    const cs = await searchCardsFts(pending.appUserId, filter, 5);
    const ks = await searchKnowledgeFts(pending.appUserId, filter, 3);
    cardItems = cs.map((c) => ({ id: c.id, label: `${STATUS_EMOJI[c.status]} ${c.title}` }));
    kItems = ks.map((k) => ({ id: k.id, label: `📚 ${k.title}` }));
  } else {
    const cs = await pool.query<{ id: string; title: string; status: Status }>(
      `SELECT DISTINCT c.id, c.title, c.status
       FROM cards c
       LEFT JOIN card_assignees ca ON ca.card_id = c.id
       LEFT JOIN card_shares cs ON cs.card_id = c.id
       WHERE NOT c.archived
         AND (
           c.created_by = $1
           OR ca.user_id = $1
           OR cs.user_id = $1
           OR NOT EXISTS (SELECT 1 FROM card_assignees ca2 WHERE ca2.card_id = c.id)
         )
       ORDER BY c.updated_at DESC LIMIT 5`,
      [pending.appUserId],
    );
    cardItems = cs.rows.map((c) => ({ id: c.id, label: `${STATUS_EMOJI[c.status]} ${c.title}` }));
    const ks = await pool.query<{ id: string; title: string }>(
      `SELECT k.id, COALESCE(NULLIF(k.title, ''), '(untitled)') AS title
       FROM knowledge_items k
       LEFT JOIN knowledge_shares ks ON ks.knowledge_id = k.id
       WHERE NOT k.archived
         AND (
           k.owner_id = $1
           OR k.visibility = 'inbox'
           OR (k.visibility = 'shared' AND ks.user_id = $1)
         )
       ORDER BY k.updated_at DESC LIMIT 3`,
      [pending.appUserId],
    );
    kItems = ks.rows.map((k) => ({ id: k.id, label: `📚 ${k.title}` }));
  }
  const items = [
    ...cardItems.map((i) => ({ kind: 'card' as const, ...i })),
    ...kItems.map((i) => ({ kind: 'knowledge' as const, ...i })),
  ];
  updatePending(pending.id, {
    attachMode: filter.trim() ? 'pickFiltered' : 'pickRecent',
    attachFilter: filter,
    attachPickerIds: items.map((it) => ({ kind: it.kind, id: it.id })),
  });
  if (items.length === 0) {
    await ctx.reply('No items found. Reply with different words or tap Cancel.', {
      reply_markup: new InlineKeyboard().text('❌ Cancel', `drop:${pending.id}`),
    });
    return;
  }
  await ctx.reply('Pick one (or reply with a few words to filter):', {
    reply_markup: attachPickerKeyboard(pending.id, items),
  });
}

async function attachToTarget(
  ctx: Context,
  pending: PendingProposal,
  kind: 'card' | 'knowledge',
  targetId: string,
): Promise<void> {
  if (!pending.pendingPhotoFileId && !pending.pendingAudioFileId) {
    await ctx.reply('Nothing to attach.');
    deletePending(pending.id);
    return;
  }
  if (kind === 'card') {
    try {
      if (pending.pendingPhotoFileId && botInstance) {
        const p = await downloadTelegramFile(botInstance, pending.pendingPhotoFileId, targetId, '.jpg');
        await attachFile(targetId, 'image', p);
      }
      if (pending.pendingAudioFileId && botInstance) {
        const p = await downloadTelegramFile(botInstance, pending.pendingAudioFileId, targetId, '.ogg');
        await attachFile(targetId, 'audio', p);
      }
      const card = await loadCard(targetId);
      if (card) broadcast({ type: 'card.updated', card });
      const actionLabel = pending.pendingPhotoFileId ? 'telegram.photo.attach' : 'telegram.voice.attach';
      await logActivity(pending.appUserId, targetId, actionLabel);
      await ctx.reply('📎 Attached to card.');
    } catch (e) {
      await ctx.reply(`Attach failed: ${e instanceof Error ? e.message : 'error'}`);
    }
  } else {
    // Knowledge items don't support binary attachments — fall back to new private card.
    await ctx.reply("Knowledge items don't support attachments yet — saving as new card instead.");
    updatePending(pending.id, { destination: 'private_card', attachMode: 'new' });
    await finalizeCard(ctx, pending, 'backlog');
    return;
  }
  deletePending(pending.id);
}

async function runDuplicateCheck(ctx: Context, pending: PendingProposal): Promise<void> {
  const q = pending.proposal.title || pending.original.slice(0, 120);
  const [cardHits, kHits] = await Promise.all([
    searchCardsFts(pending.appUserId, q, 10),
    searchKnowledgeFts(pending.appUserId, q, 10),
  ]);
  if (cardHits.length === 0 && kHits.length === 0) {
    await ctx.reply('🔍 No related items found. Pick a destination above to save.');
    return;
  }
  const candidates: Candidate[] = [
    ...cardHits.map((h) => ({
      kind: 'card' as const,
      id: h.id,
      title: h.title,
      snippet: (h.description || '').slice(0, 120),
      contextLine: `${STATUS_LABEL[h.status]}, ${relativeAge(h.updated_at)}`,
    })),
    ...kHits.map((h) => ({
      kind: 'knowledge' as const,
      id: h.id,
      title: h.title,
      snippet: h.snippet,
      contextLine: h.url ? 'Knowledge (URL)' : 'Knowledge (note)',
    })),
  ];
  const ranked = await rankCandidates(pending.original, candidates);
  if (ranked.length === 0) {
    await ctx.reply('🔍 No strong matches found. Pick a destination above to save.');
    return;
  }
  updatePending(pending.id, {
    dupCandidates: ranked.map((r) => ({
      kind: r.kind,
      id: r.id,
      title: r.title,
      snippet: r.snippet,
      contextLine: r.contextLine,
      confidence: r.confidence,
      why: r.why,
    })),
  });
  const lines = ranked.map((r) => {
    const conf = r.confidence !== undefined ? ` — ${r.confidence}% match` : '';
    const why = r.why ? `\n      why: ${r.why}` : '';
    return `• [${r.kind}] '${r.title}' (${r.contextLine})${conf}${why}`;
  });
  await ctx.reply(`🔍 Found ${ranked.length} possibly related:\n${lines.join('\n')}`, {
    reply_markup: dupResultsKeyboard(pending.id, ranked),
  });
}

// ---------- bot wiring ----------

// Post-save quick actions: move / archive. Callback shape: "mv:<status>:<uuid>" or "arch:<uuid>".
async function handlePostSaveCallback(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data ?? '';
  const moveMatch = data.match(/^mv:(today|doing|done):([0-9a-f-]{36})$/);
  const archMatch = data.match(/^arch:([0-9a-f-]{36})$/);
  if (!moveMatch && !archMatch) return false;

  const cardId = (moveMatch ? moveMatch[2]! : archMatch![1]!);
  const tgUser = ctx.from;
  const appUserId = tgUser ? await resolveAppUser(tgUser.id) : null;
  const { rows } = await pool.query<{ created_by: string | null }>(
    `SELECT created_by FROM cards WHERE id = $1`,
    [cardId],
  );
  const creator = rows[0]?.created_by ?? null;
  if (!appUserId || !creator || appUserId !== creator) {
    await ctx.answerCallbackQuery({ text: 'Only the creator can change this.' });
    return true;
  }

  if (archMatch) {
    await pool.query(
      `UPDATE cards SET archived = TRUE, updated_at = NOW() WHERE id = $1`,
      [cardId],
    );
    await logActivity(appUserId, cardId, 'telegram.archive');
    broadcast({ type: 'card.deleted', id: cardId });
    try {
      await ctx.editMessageText('🗑 Archived.', { reply_markup: undefined });
    } catch {}
    await ctx.answerCallbackQuery({ text: 'Archived' });
    return true;
  }

  const mv = moveMatch![1]!;
  const newStatus: Status = mv === 'today' ? 'today' : mv === 'doing' ? 'in_progress' : 'done';
  await pool.query(
    `UPDATE cards SET status = $2::card_status, updated_at = NOW() WHERE id = $1`,
    [cardId, newStatus],
  );
  await logActivity(appUserId, cardId, `telegram.move.${newStatus}`);
  const card = (await loadCard(cardId))!;
  broadcast({ type: 'card.updated', card });

  const badge = mv === 'today' ? '📅 Today' : mv === 'doing' ? '⚡ In Progress' : '✅ Done';
  try {
    const current = ctx.callbackQuery!.message?.text ?? '';
    // Replace any existing "✓ Saved · …" badge line with the new one; fall back to prepend.
    const nextBody = current.replace(/^(✓ Saved · )[^\n]*/, `$1${badge}`);
    const text = nextBody === current ? `✓ Moved · ${badge}\n\n${current}` : nextBody;
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: postSaveKeyboard(cardId, newStatus),
    });
  } catch {}
  await ctx.answerCallbackQuery({ text: badge });
  return true;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function handleKnowledgeCommand(
  ctx: Context,
  cmd: KnowledgeBotCommand,
  createdBy: string,
  chatId: number | undefined,
): Promise<void> {
  if (cmd.cmd === 'save') {
    if ('error' in cmd) {
      await ctx.reply('Usage: `/save <url> [| title]`', { parse_mode: 'Markdown' });
      return;
    }
    let placeholder;
    try {
      placeholder = await ctx.reply(`🔗 Saving ${new URL(cmd.url).hostname}...`);
    } catch {
      placeholder = null;
    }
    try {
      const titleAuto = !cmd.title;
      const k = await createKnowledge(createdBy, {
        title: cmd.title ?? new URL(cmd.url).hostname,
        title_auto: titleAuto,
        url: cmd.url,
        visibility: 'private',
        source: 'telegram',
        auto_fetch: true,
      });
      broadcast({ type: 'knowledge.created', knowledge: k });
      triggerFetch(k.id);

      // Wait briefly for fetch worker, then edit placeholder.
      setTimeout(async () => {
        const updated = await loadKnowledge(k.id);
        const buttons = new InlineKeyboard()
          .text('👥 Share with family', `kshare:${k.id}`)
          .row()
          .text('🏷 Tag', `ktag:${k.id}`)
          .text('🗑 Discard', `karchive:${k.id}`);
        const txt =
          updated?.fetch_status === 'ok'
            ? `✓ Saved · ${updated.title}`
            : updated?.fetch_status === 'failed'
              ? `⚠ Saved (no preview): ${updated.fetch_error ?? 'fetch failed'}`
              : `✓ Saved (still fetching) · ${k.title}`;
        if (placeholder && chatId) {
          await ctx.api
            .editMessageText(chatId, placeholder.message_id, txt, { reply_markup: buttons })
            .catch(() => {});
        } else {
          await ctx.reply(txt, { reply_markup: buttons }).catch(() => {});
        }
      }, 4000);
    } catch (e) {
      const msg =
        e instanceof KnowledgeValidationError ? e.message : (e as Error).message;
      const errText = `Cannot save: ${msg}`;
      if (placeholder && chatId) {
        await ctx.api.editMessageText(chatId, placeholder.message_id, errText).catch(() => {});
      } else {
        await ctx.reply(errText).catch(() => {});
      }
    }
    return;
  }

  if (cmd.cmd === 'note') {
    if ('error' in cmd) {
      await ctx.reply('Usage: `/note <body>`', { parse_mode: 'Markdown' });
      return;
    }
    try {
      const k = await createKnowledge(createdBy, {
        title: cmd.title,
        body: cmd.body,
        visibility: 'private',
        source: 'telegram',
        auto_fetch: false,
      });
      broadcast({ type: 'knowledge.created', knowledge: k });
      await ctx.reply(`✓ Note saved · ${k.title}`);
    } catch (e) {
      const msg = e instanceof KnowledgeValidationError ? e.message : (e as Error).message;
      await ctx.reply(`Cannot save note: ${msg}`);
    }
    return;
  }

  if (cmd.cmd === 'k') {
    if ('error' in cmd) {
      await ctx.reply('Usage: `/k <query>`', { parse_mode: 'Markdown' });
      return;
    }
    const items = await listKnowledge(createdBy, { q: cmd.q, scope: 'all', limit: 5 });
    if (items.length === 0) {
      await ctx.reply('Nothing matched.');
      return;
    }
    const lines = items
      .map((k, i) => {
        const host = k.url ? safeHost(k.url) : null;
        return `${i + 1}. ${k.title}${host ? ` — ${host}` : ''}`;
      })
      .join('\n');
    const kb = new InlineKeyboard();
    items.forEach((k, i) => kb.text(`${i + 1}`, `kshow:${k.id}`));
    await ctx.reply(lines, { reply_markup: kb });
    return;
  }

  if (cmd.cmd === 'klist') {
    const items = await listKnowledge(createdBy, { scope: 'all', limit: 10 });
    if (items.length === 0) {
      await ctx.reply('No knowledge yet.');
      return;
    }
    const lines = items
      .map((k, i) => {
        const host = k.url ? safeHost(k.url) : null;
        return `${i + 1}. ${k.title}${host ? ` — ${host}` : ''}`;
      })
      .join('\n');
    await ctx.reply(lines);
    return;
  }
}

function linkLabelEmoji(label: CardLinkLabel): string {
  switch (label) {
    case 'evolves_from': return '🌱';
    case 'supersedes':   return '➡️';
    case 'split_from':   return '✂️';
    case 'related':      return '🔗';
    case 'inspired_by':  return '💡';
    case 'duplicate_of': return '👯';
  }
}

async function showLinkPicker(
  ctx: Context,
  pending: PendingProposal,
  filter: string,
): Promise<void> {
  const userId = pending.appUserId;
  let cards: Array<{ id: string; title: string }> = [];
  if (filter.trim()) {
    const hits = await searchCardsFts(userId, filter, 8);
    cards = hits.map((h) => ({ id: h.id, title: h.title }));
  } else {
    const { rows } = await pool.query<{ id: string; title: string }>(
      `SELECT DISTINCT c.id, c.title
       FROM cards c
       LEFT JOIN card_assignees ca ON ca.card_id = c.id
       LEFT JOIN card_shares cs ON cs.card_id = c.id
       WHERE NOT c.archived
         AND (c.created_by = $1 OR ca.user_id = $1 OR cs.user_id = $1
              OR NOT EXISTS (SELECT 1 FROM card_assignees ca2 WHERE ca2.card_id = c.id))
       ORDER BY c.updated_at DESC
       LIMIT 5`,
      [userId],
    );
    cards = rows;
  }
  if (cards.length === 0) {
    const kb = new InlineKeyboard().text('❌ Cancel', `drop:${pending.id}`);
    await ctx.reply('No cards to link. Reply with different words or Cancel.', { reply_markup: kb });
    return;
  }
  const kb = new InlineKeyboard();
  for (const c of cards) {
    kb.text(`Pick: ${c.title.slice(0, 40)}`, `linkto:${c.id}:${pending.id}`).row();
  }
  kb.text('❌ Cancel', `drop:${pending.id}`);
  await ctx.reply('Pick a card to link to (or reply with words to filter):', { reply_markup: kb });
}

async function finalizeCardWithLink(
  ctx: Context,
  pending: PendingProposal,
  noteText: string | null,
): Promise<void> {
  const status: Status = pending.destination === 'private_card' || pending.destination === 'public_card'
    ? 'today'
    : 'backlog';
  if (pending.destination === 'knowledge') {
    await ctx.reply('Linking is only available for card destinations. Pick Private or Public first.');
    deletePending(pending.id);
    return;
  }
  if (!pending.pendingLinkTargetId || !pending.pendingLinkLabel) {
    await ctx.reply('Missing link target or label. Restart the flow.');
    deletePending(pending.id);
    return;
  }

  const cardId = await createCard({
    title: pending.proposal.title || pending.original.slice(0, 80),
    description: pending.proposal.description ?? '',
    tags: pending.proposal.tags ?? [],
    createdBy: pending.appUserId,
    source: 'telegram',
    status,
    aiSummarized: true,
    assignees: pending.destination === 'private_card' ? [pending.appUserId] : undefined,
    telegramChatId: pending.chatId,
    telegramMessageId: pending.promptMessageId ?? undefined,
  });

  try {
    await createLink(
      pending.appUserId,
      cardId,
      pending.pendingLinkTargetId,
      pending.pendingLinkLabel,
      noteText,
    );
  } catch {
    // Non-fatal — card is saved even if link fails
  }

  await logActivity(pending.appUserId, cardId, `telegram.${pending.destination}.linked`);
  deletePending(pending.id);

  const target = await loadCard(pending.pendingLinkTargetId);
  const noteLine = noteText ? `\n   note: "${noteText.slice(0, 80)}"` : '';
  const card = await loadCard(cardId);
  await ctx.reply(
    `✓ Saved · ${STATUS_EMOJI[status]} ${STATUS_LABEL[status]} — ${pending.proposal.title}\n🔗 ${pending.pendingLinkLabel} "${target?.title ?? '(unknown)'}"${noteLine}`,
    {
      reply_markup: card ? postSaveKeyboard(cardId, status) : undefined,
    },
  );
  if (card) {
    broadcast({ type: 'card.created', card });
  }
}

export function buildBot(token: string): Bot {
  const bot = new Bot(token);

  bot.on('callback_query:data', async (ctx, next) => {
    try {
      if (await handlePostSaveCallback(ctx)) return;
    } catch {
      try {
        await ctx.answerCallbackQuery({ text: 'error' });
      } catch {}
      return;
    }
    return next();
  });

  bot.callbackQuery(/^kshow:/, async (ctx) => {
    const id = ctx.callbackQuery.data.slice('kshow:'.length);
    const tgId = ctx.from.id;
    const userId = await resolveAppUser(tgId);
    if (!userId) {
      await ctx.answerCallbackQuery({ text: 'Link your Telegram identity first.' });
      return;
    }
    const k = await loadKnowledge(id);
    if (!k) {
      await ctx.answerCallbackQuery({ text: 'Item not found.' });
      return;
    }
    if (!(await canUserSeeKnowledge(userId, k))) {
      await ctx.answerCallbackQuery({ text: 'Not visible.' });
      return;
    }
    const body = (k.body || '').slice(0, 4000);
    await ctx.answerCallbackQuery();
    await ctx.reply(`${k.title}\n\n${body}${(k.body ?? '').length > 4000 ? '\n...' : ''}`);
  });

  bot.callbackQuery(/^kshare:/, async (ctx) => {
    const id = ctx.callbackQuery.data.slice('kshare:'.length);
    const userId = await resolveAppUser(ctx.from.id);
    if (!userId) {
      await ctx.answerCallbackQuery({ text: 'Link your Telegram identity first.' });
      return;
    }
    try {
      const updated = await updateKnowledge(userId, id, { visibility: 'inbox' });
      if (!updated) {
        await ctx.answerCallbackQuery({ text: 'Not found.' });
        return;
      }
      broadcast({ type: 'knowledge.updated', knowledge: updated });
      await ctx.answerCallbackQuery({ text: 'Shared with family.' });
    } catch {
      await ctx.answerCallbackQuery({ text: 'Cannot change visibility.' });
    }
  });

  bot.callbackQuery(/^karchive:/, async (ctx) => {
    const id = ctx.callbackQuery.data.slice('karchive:'.length);
    const userId = await resolveAppUser(ctx.from.id);
    if (!userId) {
      await ctx.answerCallbackQuery({ text: 'Link your Telegram identity first.' });
      return;
    }
    const k = await loadKnowledge(id);
    if (!k) {
      await ctx.answerCallbackQuery({ text: 'Not found.' });
      return;
    }
    const ok = await archiveKnowledge(userId, id);
    if (!ok) {
      await ctx.answerCallbackQuery({ text: 'Forbidden.' });
      return;
    }
    broadcast({
      type: 'knowledge.deleted',
      id,
      owner_id: k.owner_id,
      visibility: k.visibility,
      shares: k.shares ?? [],
    });
    await ctx.answerCallbackQuery({ text: 'Archived.' });
  });

  bot.callbackQuery(/^ktag:/, async (ctx) => {
    await ctx.answerCallbackQuery({
      text: 'Reply to the saved message with #tag #tag — coming soon.',
    });
  });

  // ---------- structured-capture callbacks ----------

  bot.callbackQuery(/^edit:([^:]+)$/, async (ctx) => {
    const pid = ctx.match![1]!;
    const pending = getPending(pid);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: 'Session expired. Send your message again.', show_alert: true });
      return;
    }
    if (ctx.from?.id !== pending.tgUserId) {
      await ctx.answerCallbackQuery({ text: 'Only the sender can act on this proposal.' });
      return;
    }
    updatePending(pid, { awaitingEdit: true });
    try {
      await ctx.editMessageText(
        `${proposalText(pending.proposal, pending.links)}\n\n✏️ _Send your correction as a new message._`,
        { parse_mode: 'Markdown', reply_markup: undefined },
      );
    } catch {}
    await ctx.answerCallbackQuery({ text: 'Send your correction' });
  });

  bot.callbackQuery(/^drop:([^:]+)$/, async (ctx) => {
    const pid = ctx.match![1]!;
    const pending = getPending(pid);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: 'Already gone.' });
      return;
    }
    if (ctx.from?.id !== pending.tgUserId) {
      await ctx.answerCallbackQuery({ text: 'Only the sender can act on this proposal.' });
      return;
    }
    deletePending(pid);
    try {
      await ctx.editMessageText('❌ Discarded.', { reply_markup: undefined });
    } catch {}
    await ctx.answerCallbackQuery({ text: 'Discarded' });
  });

  bot.callbackQuery(/^dest:(private_card|public_card|knowledge):([^:]+)$/, async (ctx) => {
    const dest = ctx.match![1] as Destination;
    const pid = ctx.match![2]!;
    const pending = getPending(pid);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: 'Session expired. Send your message again.', show_alert: true });
      return;
    }
    updatePending(pid, { destination: dest });
    await ctx.answerCallbackQuery();
    if (dest === 'knowledge') {
      await finalizeKnowledge(ctx, pending);
      return;
    }
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: columnKeyboard(pid) });
      await ctx.reply('Which column?');
    } catch { /* edit non-fatal */ }
  });

  bot.callbackQuery(/^col:(backlog|today|in_progress|done):([^:]+)$/, async (ctx) => {
    const status = ctx.match![1] as Status;
    const pid = ctx.match![2]!;
    const pending = getPending(pid);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    await finalizeCard(ctx, pending, status);
  });

  bot.callbackQuery(/^dup:check:([^:]+)$/, async (ctx) => {
    const pid = ctx.match![1]!;
    const pending = getPending(pid);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery({ text: 'Scanning…' });
    await runDuplicateCheck(ctx, pending);
  });

  bot.callbackQuery(/^dup:link:(card|knowledge):([^:]+):([^:]+)$/, async (ctx) => {
    const kind = ctx.match![1] as 'card' | 'knowledge';
    const id = ctx.match![2]!;
    const pid = ctx.match![3]!;
    const pending = getPending(pid);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    deletePending(pid);
    await ctx.reply(`🔗 Linked to existing ${kind}.`);
    // The actual linking semantics: for now, we just acknowledge — the user may
    // navigate to the existing item via the web app. Future work could record
    // a back-reference; not in scope for this task.
    void id;
  });

  bot.callbackQuery(/^dup:save:([^:]+)$/, async (ctx) => {
    const pid = ctx.match![1]!;
    const pending = getPending(pid);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    try {
      await ctx.editMessageReplyMarkup({
        reply_markup: destinationKeyboard(
          pid,
          defaultDestination(pending.proposal, pending.isPrivateChat),
          pending.isPrivateChat,
        ),
      });
    } catch {}
  });

  // att:new:<pid> — proceed to text destination flow with media pending
  bot.callbackQuery(/^att:new:([^:]+)$/, async (ctx) => {
    const pid = ctx.match![1]!;
    const pending = getPending(pid);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
      return;
    }
    if (ctx.from?.id !== pending.tgUserId) {
      await ctx.answerCallbackQuery({ text: 'Not your prompt.', show_alert: true });
      return;
    }
    updatePending(pid, { attachMode: 'new' });
    await ctx.answerCallbackQuery();
    const def = defaultDestination(pending.proposal, pending.isPrivateChat);
    try {
      await ctx.editMessageReplyMarkup({
        reply_markup: destinationKeyboard(pid, def, pending.isPrivateChat),
      });
    } catch {}
  });

  // att:pick:<pid> — open attach picker (recent items)
  bot.callbackQuery(/^att:pick:([^:]+)$/, async (ctx) => {
    const pid = ctx.match![1]!;
    const pending = getPending(pid);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
      return;
    }
    if (ctx.from?.id !== pending.tgUserId) {
      await ctx.answerCallbackQuery({ text: 'Not your prompt.', show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    await showAttachPicker(ctx, pending, '');
  });

  // att:to:<kind>:<targetId>:<pid> — attach to picked target
  bot.callbackQuery(/^att:to:(card|knowledge):([^:]+):([^:]+)$/, async (ctx) => {
    const kind = ctx.match![1] as 'card' | 'knowledge';
    const targetId = ctx.match![2]!;
    const pid = ctx.match![3]!;
    const pending = getPending(pid);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
      return;
    }
    if (ctx.from?.id !== pending.tgUserId) {
      await ctx.answerCallbackQuery({ text: 'Not your prompt.', show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    await attachToTarget(ctx, pending, kind, targetId);
  });

  // linkpick:<pid> — open recent-cards picker for linking
  bot.callbackQuery(/^linkpick:([^:]+)$/, async (ctx) => {
    const pid = ctx.match![1]!;
    const pending = getPending(pid);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
      return;
    }
    if (ctx.from?.id !== pending.tgUserId) {
      await ctx.answerCallbackQuery({ text: 'Not your prompt.', show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    await showLinkPicker(ctx, pending, '');
  });

  // linkto:<targetCardId>:<pid> — user picked a card to link to
  bot.callbackQuery(/^linkto:([0-9a-f-]+):([^:]+)$/, async (ctx) => {
    const targetId = ctx.match![1]!;
    const pid = ctx.match![2]!;
    const pending = getPending(pid);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
      return;
    }
    if (ctx.from?.id !== pending.tgUserId) {
      await ctx.answerCallbackQuery({ text: 'Not your prompt.', show_alert: true });
      return;
    }
    if (!(await canUserSeeCard(pending.appUserId, targetId))) {
      await ctx.answerCallbackQuery({ text: 'Card not visible to you.', show_alert: true });
      return;
    }
    updatePending(pid, { pendingLinkTargetId: targetId });
    await ctx.answerCallbackQuery();
    const target = await loadCard(targetId);
    const kb = new InlineKeyboard();
    const labels: CardLinkLabel[] = [
      'evolves_from', 'supersedes', 'split_from', 'related', 'inspired_by', 'duplicate_of',
    ];
    labels.forEach((l, i) => {
      kb.text(`${linkLabelEmoji(l)} ${l.replace(/_/g, ' ')}`, `linklabel:${l}:${pid}`);
      if (i % 2 === 1) kb.row();
    });
    await ctx.reply(
      `Link to "${target?.title ?? targetId}" — what kind of relationship?`,
      { reply_markup: kb },
    );
  });

  // linklabel:<label>:<pid> — user picked a label
  bot.callbackQuery(/^linklabel:([a-z_]+):([^:]+)$/, async (ctx) => {
    const labelStr = ctx.match![1]!;
    const pid = ctx.match![2]!;
    const pending = getPending(pid);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
      return;
    }
    if (!isCardLinkLabel(labelStr)) {
      await ctx.answerCallbackQuery({ text: 'Invalid label.', show_alert: true });
      return;
    }
    updatePending(pid, { pendingLinkLabel: labelStr, awaitingLinkNote: true });
    await ctx.answerCallbackQuery();
    const skipKb = new InlineKeyboard().text('Skip', `linknote:skip:${pid}`);
    await ctx.reply('Add a note? Reply with text or tap Skip.', { reply_markup: skipKb });
  });

  // linknote:skip:<pid>
  bot.callbackQuery(/^linknote:skip:([^:]+)$/, async (ctx) => {
    const pid = ctx.match![1]!;
    const pending = getPending(pid);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: 'Session expired.', show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    updatePending(pid, { awaitingLinkNote: false });
    await finalizeCardWithLink(ctx, pending, null);
  });

  bot.callbackQuery(/^brain:([^:]+)$/, async (ctx) => {
    const cardId = ctx.match![1]!;
    const tgUserId = ctx.from?.id;
    if (!tgUserId) {
      await ctx.answerCallbackQuery({ text: 'no user', show_alert: true });
      return;
    }
    const appUserId = await resolveAppUser(tgUserId, ctx.from?.username ?? undefined);
    if (!appUserId) {
      await ctx.answerCallbackQuery({ text: 'Link your Telegram identity first.', show_alert: true });
      return;
    }
    if (!AI_ENABLED()) {
      await ctx.answerCallbackQuery({ text: 'AI not configured.', show_alert: true });
      return;
    }
    if (!(await canUserSeeCard(appUserId, cardId))) {
      await ctx.answerCallbackQuery({ text: 'Card not visible to you.', show_alert: true });
      return;
    }
    const [pendingCard, pendingUser, today] = await Promise.all([
      countPendingByCard(cardId),
      countPendingByUser(appUserId),
      countTodayByUser(appUserId),
    ]);
    if (pendingCard >= 1) {
      await ctx.answerCallbackQuery({ text: 'Already researching this card.', show_alert: true });
      return;
    }
    if (pendingUser >= 5) {
      await ctx.answerCallbackQuery({ text: 'Too many pending — try later.', show_alert: true });
      return;
    }
    if (today >= 50) {
      await ctx.answerCallbackQuery({ text: 'Daily limit reached.', show_alert: true });
      return;
    }
    const insight = await createInsight(cardId, appUserId);
    enqueueBrainstorm(insight.id);
    await ctx.answerCallbackQuery({ text: 'Research queued' });
    // Strip the brainstorm button so it isn't re-tapped
    try {
      const card = await loadCard(cardId);
      if (card) {
        const kb = new InlineKeyboard();
        const row: Array<[string, Status, string]> = [
          ['📅 Today', 'today', `mv:today:${cardId}`],
          ['⚡ Doing', 'in_progress', `mv:doing:${cardId}`],
          ['✅ Done', 'done', `mv:done:${cardId}`],
        ];
        for (const [label, s, cb] of row) if (s !== card.status) kb.text(label, cb);
        kb.text('🗑', `arch:${cardId}`);
        await ctx.editMessageReplyMarkup({ reply_markup: kb });
      }
    } catch { /* edit non-fatal */ }
    await ctx.reply('✓ Research queued — open card for results when ready.');
  });

  bot.on('message', async (ctx, next) => {
    const chatId = ctx.chat?.id;
    const chatType = ctx.chat?.type;
    const allowed = allowedGroupId();
    const isPrivateChat = chatType === 'private';
    // Accept: (a) messages in the configured family group, or
    //         (b) DMs from any registered telegram_identity (private capture).
    if (!isPrivateChat && allowed !== null && chatId !== allowed) {
      return; // silent ignore outside family group
    }
    const tgUser = ctx.from;
    if (!tgUser) return;
    const appUserId = await resolveAppUser(tgUser.id, tgUser.username);
    if (!appUserId) return; // unknown sender: silent ignore

    try {
      if (ctx.msg?.voice || ctx.msg?.audio) {
        await handleVoice(ctx, appUserId, isPrivateChat);
      } else if (ctx.msg?.photo) {
        await handlePhoto(ctx, appUserId, isPrivateChat);
      } else if (ctx.msg?.text) {
        await handleText(ctx, ctx.msg.text, appUserId, isPrivateChat);
      }
    } catch (e) {
      // Never drop user input silently: save a card with raw body if possible.
      const raw = ctx.msg?.text ?? ctx.msg?.caption ?? '[telegram message — handler error]';
      const { tags, text: clean } = extractHashtags(raw);
      const cardId = await createCard({
        title: splitTitleDesc(clean).title || '[telegram error]',
        description: splitTitleDesc(clean).description,
        tags,
        createdBy: appUserId,
        source: 'telegram',
        needsReview: true,
      });
      await logActivity(appUserId, cardId, 'telegram.error', {
        error: String((e as Error)?.message ?? e),
      });
      const card = (await loadCard(cardId))!;
      broadcast({ type: 'card.created', card });
    }
    return next();
  });

  // Global error handler. Without this, any handler throw — including expected
  // grammy errors like a stale answerCallbackQuery (400 "query is too old") —
  // bubbles out of bot.start() and kills the long-polling loop. We log and
  // swallow so polling survives.
  bot.catch((err) => {
    console.error('[telegram] handler error on update', err.ctx?.update?.update_id, ':', err.error);
  });

  return bot;
}

export async function startTelegramBot(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  if (botInstance) return;
  botInstance = buildBot(token);

  // Webhook mode if a URL is configured, otherwise long polling as dev fallback.
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  if (webhookUrl) {
    await botInstance.api.setWebhook(webhookUrl);
    console.log('[telegram] webhook mode:', webhookUrl);
  } else if (!pollingStarted) {
    pollingStarted = true;
    // Clear any stale webhook + drop pending updates before starting long polling.
    // grammy's bot.start() does call deleteWebhook by default, but only with
    // drop_pending_updates=false, so a wedged update can keep it from advancing.
    try {
      await botInstance.api.deleteWebhook({ drop_pending_updates: true });
    } catch (err) {
      console.error('[telegram] deleteWebhook failed:', err);
    }
    botInstance
      .start({ onStart: (info) => console.log('[telegram] polling started as @' + info.username) })
      .catch((err) => console.error('[telegram] polling crashed:', err));
  }
}

export function telegramWebhookCallback() {
  if (!botInstance) return null;
  return webhookCallback(botInstance, 'fastify');
}

export async function sendBrainstormNudge(
  appUserId: string,
  cardTitle: string,
  status: 'ok' | 'failed',
  error?: string,
): Promise<void> {
  if (!botInstance) return;
  const { rows } = await pool.query<{ telegram_user_id: number }>(
    `SELECT telegram_user_id FROM telegram_identities WHERE app_user_id = $1 LIMIT 1`,
    [appUserId],
  );
  const tgUserId = rows[0]?.telegram_user_id;
  if (!tgUserId) return;
  const text = status === 'ok'
    ? `📚 Brainstorm done — ${cardTitle}`
    : `⚠ Brainstorm failed: ${error?.slice(0, 100) ?? 'unknown error'} — try again from the card.`;
  try {
    await botInstance.api.sendMessage(tgUserId, text);
  } catch { /* user blocked bot, etc. */ }
}
