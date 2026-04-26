import dns from 'node:dns/promises';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { setFetchResult, loadKnowledge } from './knowledge.js';
import { broadcast } from './ws.js';
import { enqueueEmbed } from './ai/embed_queue.js';

const TIMEOUT_MS = Number(process.env.KNOWLEDGE_FETCH_TIMEOUT_MS ?? 10_000);
const MAX_BYTES = 5 * 1024 * 1024;
const ENABLED = process.env.KNOWLEDGE_AUTOFETCH !== 'false';

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^0\./,
];
const PRIVATE_V6_PREFIX = ['::1', 'fc', 'fd', 'fe80'];

export async function isHostBlockedForSSRF(host: string): Promise<boolean> {
  if (!host || host === 'localhost') return true;
  let addrs: { address: string; family: number }[] = [];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    return true;
  }
  for (const a of addrs) {
    if (a.family === 4 && PRIVATE_V4.some(re => re.test(a.address))) return true;
    if (a.family === 6) {
      const lo = a.address.toLowerCase();
      if (PRIVATE_V6_PREFIX.some(p => lo === p || lo.startsWith(p + ':') || lo.startsWith(p))) return true;
    }
  }
  return false;
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export async function fetchAndExtract(
  url: string,
  fetcher: Fetcher = (u, i) => fetch(u, i),
): Promise<{ title: string | null; body: string }> {
  const u = new URL(url);
  if (await isHostBlockedForSSRF(u.hostname)) {
    throw new Error('blocked: private/local host');
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetcher(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'SmartKanban-Knowledge/1.0' },
    });
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) throw new Error(`http ${res.status}`);
  const ct = (res.headers.get('content-type') ?? '').toLowerCase();
  if (!ct.startsWith('text/html') && !ct.startsWith('application/xhtml')) {
    throw new Error(`unsupported content-type ${ct}`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error('empty body');
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      ctrl.abort();
      throw new Error('response too large');
    }
    chunks.push(value);
  }
  const html = new TextDecoder('utf-8').decode(
    Buffer.concat(chunks.map(c => Buffer.from(c))),
  );
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  if (!article) {
    return {
      title: null,
      body: dom.window.document.body?.textContent?.trim().slice(0, 50_000) ?? '',
    };
  }
  const body = (article.textContent ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 200_000);
  return { title: article.title?.trim() || null, body };
}

const inflight = new Set<string>();

export function triggerFetch(id: string): void {
  if (!ENABLED) return;
  if (inflight.has(id)) return;
  inflight.add(id);
  setImmediate(async () => {
    try {
      const k = await loadKnowledge(id);
      if (!k || !k.url) return;
      try {
        const { title, body } = await fetchAndExtract(k.url);
        const updated = await setFetchResult(id, {
          status: 'ok',
          body,
          title: title ?? undefined,
        });
        if (updated) {
          broadcast({ type: 'knowledge.updated', knowledge: updated });
          enqueueEmbed(id);
        }
      } catch (err) {
        const updated = await setFetchResult(id, {
          status: 'failed',
          error: (err as Error).message ?? String(err),
        });
        if (updated) broadcast({ type: 'knowledge.updated', knowledge: updated });
      }
    } finally {
      inflight.delete(id);
    }
  });
}
