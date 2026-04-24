import fs from 'node:fs/promises';
import path from 'node:path';
import { Bot, InlineKeyboard, webhookCallback, type Context } from 'grammy';
import { pool } from '../db.js';
import { broadcast } from '../ws.js';
import { loadCard, logActivity, type Status } from '../cards.js';
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
} from './proposals.js';

let botInstance: Bot | null = null;
let pollingStarted = false;

export function getBot(): Bot | null {
  return botInstance;
}

const ATTACHMENTS_DIR = path.resolve(process.env.ATTACHMENTS_DIR ?? 'data/attachments');

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

function proposalKeyboard(id: string, isPrivateChat: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (isPrivateChat) {
    kb.text('✅ Save', `save:${id}`);
  } else {
    kb.text('🔒 Private', `savep:${id}`).text('👥 Public', `savepub:${id}`);
  }
  kb.row().text('📅 Today', `savet:${id}`).text('⚡ Doing', `saved:${id}`);
  kb.row()
    .text('🔗 Add link', `link:${id}`)
    .text('✏️ Edit', `edit:${id}`)
    .text('❌ Cancel', `drop:${id}`);
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
  return kb;
}

async function sendProposal(
  ctx: Context,
  pendingId: string,
  p: AIProposal,
  isPrivateChat: boolean,
  links: string[] = [],
): Promise<number | null> {
  try {
    const msg = await ctx.reply(proposalText(p, links), {
      parse_mode: 'Markdown',
      reply_markup: proposalKeyboard(pendingId, isPrivateChat),
      reply_parameters: { message_id: ctx.msg!.message_id, allow_sending_without_reply: true },
    });
    return msg.message_id;
  } catch {
    return null;
  }
}

async function sendPrivacyPrompt(ctx: Context, cardId: string): Promise<void> {
  try {
    const kb = new InlineKeyboard()
      .text('🔒 Private', `priv:${cardId}`)
      .text('👥 Public', `pub:${cardId}`);
    await ctx.reply('Where should this go?', {
      reply_markup: kb,
      reply_parameters: { message_id: ctx.msg!.message_id, allow_sending_without_reply: true },
    });
  } catch {}
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
    if (!isPrivate) await sendPrivacyPrompt(ctx, cardId);
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
  if (!isPrivate) await sendPrivacyPrompt(ctx, cardId);
}

async function handleVoice(ctx: Context, createdBy: string, isPrivate = false): Promise<void> {
  const voice = ctx.msg?.voice ?? ctx.msg?.audio;
  if (!voice) return;
  const tmpCardId = crypto.randomUUID();
  const bot = getBot()!;
  const audioPath = await downloadTelegramFile(bot, voice.file_id, tmpCardId, '.ogg');

  const transcript = await transcribeAudio(audioPath);
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

  const cardId = await createCard({
    title,
    description,
    createdBy,
    source: 'telegram',
    tags: transcript ? extractHashtags(transcript).tags : [],
    needsReview,
    telegramChatId: ctx.chat?.id,
    telegramMessageId: ctx.msg?.message_id,
    assignees: isPrivate ? [createdBy] : undefined,
  });
  // Move the attachment from temp dir to the real card dir.
  const finalDir = path.join(ATTACHMENTS_DIR, cardId);
  await fs.mkdir(finalDir, { recursive: true });
  const finalPath = path.join(finalDir, path.basename(audioPath));
  await fs.rename(audioPath, finalPath);
  await fs.rmdir(path.dirname(audioPath)).catch(() => {});
  await attachFile(cardId, 'audio', finalPath);

  await logActivity(createdBy, cardId, 'telegram.voice');
  const card = (await loadCard(cardId))!;
  broadcast({ type: 'card.created', card });
  await reactOk(ctx, transcript ? '👍' : '🤔');
  if (!isPrivate) await sendPrivacyPrompt(ctx, cardId);
}

async function handlePhoto(ctx: Context, createdBy: string, isPrivate = false): Promise<void> {
  const photos = ctx.msg?.photo;
  if (!photos || photos.length === 0) return;
  const largest = photos[photos.length - 1]!;
  const tmpCardId = crypto.randomUUID();
  const bot = getBot()!;
  const imagePath = await downloadTelegramFile(bot, largest.file_id, tmpCardId, '.jpg');

  const caption = ctx.msg?.caption ?? '';
  const captionTags = extractHashtags(caption).tags;

  const vision = await summarizeImage(imagePath);
  let title: string;
  let description = '';
  let aiSummarized = false;
  let needsReview = false;

  if (vision) {
    title = vision.title;
    description = vision.description + (caption ? (description ? '\n\n' : '') + caption : '');
    aiSummarized = true;
  } else if (caption.trim()) {
    const split = splitTitleDesc(extractHashtags(caption).text);
    title = split.title;
    description = split.description;
  } else {
    title = '[photo — needs review]';
    needsReview = true;
  }

  const cardId = await createCard({
    title,
    description,
    createdBy,
    source: 'telegram',
    tags: captionTags,
    aiSummarized,
    needsReview,
    telegramChatId: ctx.chat?.id,
    telegramMessageId: ctx.msg?.message_id,
    assignees: isPrivate ? [createdBy] : undefined,
  });
  const finalDir = path.join(ATTACHMENTS_DIR, cardId);
  await fs.mkdir(finalDir, { recursive: true });
  const finalPath = path.join(finalDir, path.basename(imagePath));
  await fs.rename(imagePath, finalPath);
  await fs.rmdir(path.dirname(imagePath)).catch(() => {});
  await attachFile(cardId, 'image', finalPath);

  await logActivity(createdBy, cardId, 'telegram.photo');
  const card = (await loadCard(cardId))!;
  broadcast({ type: 'card.created', card });
  await reactOk(ctx, aiSummarized ? '👍' : '🤔');
  if (!isPrivate) await sendPrivacyPrompt(ctx, cardId);
}

// ---------- bot wiring ----------
async function saveProposalAsCard(
  pending: ReturnType<typeof getPending> & object,
  mode: 'auto' | 'private' | 'public' | 'today' | 'doing',
): Promise<string> {
  const { proposal, appUserId, chatId, isPrivateChat, promptMessageId, links } = pending;
  // Today / Doing / DM saves all imply private. Explicit public keeps it in Inbox.
  const effectivelyPrivate =
    mode === 'private' ||
    mode === 'today' ||
    mode === 'doing' ||
    (mode === 'auto' && isPrivateChat);
  const status: Status = mode === 'today' ? 'today' : mode === 'doing' ? 'in_progress' : 'backlog';
  const descWithLinks =
    links.length > 0
      ? `${proposal.description}${proposal.description ? '\n\n' : ''}Links:\n${links.map((l) => `- ${l}`).join('\n')}`
      : proposal.description;
  const cardId = await createCard({
    title: proposal.title,
    description: descWithLinks,
    tags: proposal.tags,
    createdBy: appUserId,
    source: 'telegram',
    status,
    telegramChatId: chatId,
    telegramMessageId: promptMessageId ?? undefined,
    assignees: effectivelyPrivate ? [appUserId] : undefined,
  });
  await logActivity(
    appUserId,
    cardId,
    `telegram.proposal.${mode}${effectivelyPrivate ? '' : '.public'}`,
  );
  const card = (await loadCard(cardId))!;
  broadcast({ type: 'card.created', card });
  return cardId;
}

async function handleProposalCallback(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data ?? '';
  const m = data.match(
    /^(save|savep|savepub|savet|saved|edit|link|drop):([A-Za-z0-9_-]{6,16})$/,
  );
  if (!m) return false;
  const action = m[1]!;
  const pendingId = m[2]!;

  const pending = getPending(pendingId);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: 'Proposal expired — send again.' });
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    } catch {}
    return true;
  }
  // Only the originator can act.
  if (ctx.from?.id !== pending.tgUserId) {
    await ctx.answerCallbackQuery({ text: 'Only the sender can act on this proposal.' });
    return true;
  }

  if (action === 'drop') {
    deletePending(pendingId);
    try {
      await ctx.editMessageText('❌ Discarded.', { reply_markup: undefined });
    } catch {}
    await ctx.answerCallbackQuery({ text: 'Discarded' });
    return true;
  }

  if (action === 'edit') {
    updatePending(pendingId, { awaitingEdit: true });
    try {
      await ctx.editMessageText(
        `${proposalText(pending.proposal, pending.links)}\n\n✏️ _Send your correction as a new message._`,
        { parse_mode: 'Markdown', reply_markup: undefined },
      );
    } catch {}
    await ctx.answerCallbackQuery({ text: 'Send your correction' });
    return true;
  }

  if (action === 'link') {
    updatePending(pendingId, { awaitingLinks: true });
    try {
      await ctx.editMessageText(
        `${proposalText(pending.proposal, pending.links)}\n\n🔗 _Paste the URL(s) now._`,
        { parse_mode: 'Markdown', reply_markup: undefined },
      );
    } catch {}
    await ctx.answerCallbackQuery({ text: 'Send URL(s)' });
    return true;
  }

  const mode: 'auto' | 'private' | 'public' | 'today' | 'doing' =
    action === 'savep'
      ? 'private'
      : action === 'savepub'
        ? 'public'
        : action === 'savet'
          ? 'today'
          : action === 'saved'
            ? 'doing'
            : 'auto';
  let cardId: string;
  try {
    cardId = await saveProposalAsCard(pending, mode);
  } catch {
    await ctx.answerCallbackQuery({ text: 'Save failed' });
    return true;
  }
  const badge =
    mode === 'today'
      ? '📅 Today'
      : mode === 'doing'
        ? '⚡ In Progress'
        : mode === 'public' || (mode === 'auto' && !pending.isPrivateChat)
          ? '👥 Public'
          : '🔒 Private';
  const status: Status = mode === 'today' ? 'today' : mode === 'doing' ? 'in_progress' : 'backlog';
  deletePending(pendingId);
  try {
    await ctx.editMessageText(
      `✓ Saved · ${badge}\n\n${proposalText(pending.proposal, pending.links)}`,
      {
        parse_mode: 'Markdown',
        reply_markup: postSaveKeyboard(cardId, status),
      },
    );
  } catch {}
  await ctx.answerCallbackQuery({ text: `Saved (${badge})` });
  return true;
}

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

async function handlePrivacyCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data ?? '';
  const m = data.match(/^(priv|pub):([0-9a-f-]{36})$/);
  if (!m) return;
  const action = m[1]!;
  const cardId = m[2]!;

  // Only the card's creator (identified via telegram_identities -> app user) can flip it.
  const tgUser = ctx.from;
  const appUserId = tgUser ? await resolveAppUser(tgUser.id) : null;
  const { rows } = await pool.query<{ created_by: string | null }>(
    `SELECT created_by FROM cards WHERE id = $1`,
    [cardId],
  );
  const creator = rows[0]?.created_by ?? null;
  if (!appUserId || !creator || appUserId !== creator) {
    await ctx.answerCallbackQuery({ text: 'Only the sender can set privacy.', show_alert: false });
    return;
  }

  if (action === 'priv') {
    await pool.query(
      `INSERT INTO card_assignees (card_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [cardId, appUserId],
    );
    await pool.query(`DELETE FROM card_shares WHERE card_id = $1`, [cardId]);
  } else {
    // Public -> Family Inbox: strip assignees + shares so it's visible to everyone's inbox.
    await pool.query(`DELETE FROM card_assignees WHERE card_id = $1`, [cardId]);
    await pool.query(`DELETE FROM card_shares WHERE card_id = $1`, [cardId]);
  }
  await pool.query(`UPDATE cards SET updated_at = NOW() WHERE id = $1`, [cardId]);

  await logActivity(appUserId, cardId, action === 'priv' ? 'telegram.private' : 'telegram.public');
  const card = (await loadCard(cardId))!;
  broadcast({ type: 'card.updated', card });

  const label = action === 'priv' ? '🔒 Private' : '👥 Public (Inbox)';
  try {
    await ctx.editMessageText(`✓ ${label}`, { reply_markup: undefined });
  } catch {}
  await ctx.answerCallbackQuery({ text: label });
}

export function buildBot(token: string): Bot {
  const bot = new Bot(token);

  bot.on('callback_query:data', async (ctx) => {
    try {
      if (await handleProposalCallback(ctx)) return;
      if (await handlePostSaveCallback(ctx)) return;
      await handlePrivacyCallback(ctx);
    } catch {
      try {
        await ctx.answerCallbackQuery({ text: 'error' });
      } catch {}
    }
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
  } else if (!pollingStarted) {
    pollingStarted = true;
    botInstance.start({ onStart: () => {} }).catch(() => {});
  }
}

export function telegramWebhookCallback() {
  if (!botInstance) return null;
  return webhookCallback(botInstance, 'fastify');
}
