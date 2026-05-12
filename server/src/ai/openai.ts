import OpenAI from 'openai';

// ---------- clients ----------
// Lazily constructed so the server boots fine without any AI keys.
let _openrouter: OpenAI | null | undefined;
let _openai: OpenAI | null | undefined;

export function openrouter(): OpenAI | null {
  if (_openrouter !== undefined) return _openrouter;
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    _openrouter = null;
    return null;
  }
  _openrouter = new OpenAI({
    apiKey: key,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': process.env.APP_URL ?? 'http://localhost',
      'X-Title': 'Kanban Family',
    },
  });
  return _openrouter;
}

export function openai(): OpenAI | null {
  if (_openai !== undefined) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    _openai = null;
    return null;
  }
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

export const AI_ENABLED = () => !!(openrouter() || openai());

// ---------- capability-typed targets ----------
export type ChatTarget = { client: OpenAI; model: string; label: string };

// Primary chat target: OpenRouter if configured, else OpenAI.
export function chatPrimary(): ChatTarget | null {
  const or = openrouter();
  if (or) {
    return {
      client: or,
      model: process.env.OPENROUTER_MODEL ?? 'google/gemini-2.0-flash-001',
      label: 'openrouter',
    };
  }
  const oa = openai();
  if (oa) return { client: oa, model: 'gpt-4o-mini', label: 'openai' };
  return null;
}

// Fallback chat target: OpenAI if both keys are set and the primary is OpenRouter.
// Returns null if there is no fallback (either OpenAI is already primary, or no OpenAI key).
export function chatFallback(): ChatTarget | null {
  const or = openrouter();
  const oa = openai();
  if (or && oa) return { client: oa, model: 'gpt-4o-mini', label: 'openai' };
  return null;
}

export function visionPrimary(): ChatTarget | null {
  const or = openrouter();
  if (or) {
    return {
      client: or,
      model: process.env.OPENROUTER_VISION_MODEL ?? 'google/gemini-2.0-flash-001',
      label: 'openrouter',
    };
  }
  const oa = openai();
  if (oa) return { client: oa, model: 'gpt-4o-mini', label: 'openai' };
  return null;
}

export function visionFallback(): ChatTarget | null {
  const or = openrouter();
  const oa = openai();
  if (or && oa) return { client: oa, model: 'gpt-4o-mini', label: 'openai' };
  return null;
}

// Whisper is only on OpenAI (OpenRouter does not offer audio transcription).
export function audioClient(): OpenAI | null {
  return openai();
}

// Run fn against primary, falling back once on any thrown error. Returns null
// if both paths fail (or primary is unset).
async function _withChatFallback<T>(
  fn: (target: ChatTarget) => Promise<T>,
): Promise<T | null> {
  const primary = chatPrimary();
  if (!primary) {
    console.warn('[ai] chat: no primary client configured');
    return null;
  }
  try {
    return await fn(primary);
  } catch (err) {
    console.warn(`[ai] chat primary (${primary.label}/${primary.model}) failed:`, String(err).slice(0, 400));
    const fb = chatFallback();
    if (!fb) {
      console.warn('[ai] chat: no fallback available');
      return null;
    }
    try {
      return await fn(fb);
    } catch (err2) {
      console.warn(`[ai] chat fallback (${fb.label}/${fb.model}) failed:`, String(err2).slice(0, 400));
      return null;
    }
  }
}

// Mutable holder so tests can swap the implementation without fighting ESM sealing.
export const aiHooks: {
  withChatFallback: typeof _withChatFallback;
} = {
  withChatFallback: _withChatFallback,
};

export async function withChatFallback<T>(
  fn: (target: ChatTarget) => Promise<T>,
): Promise<T | null> {
  return aiHooks.withChatFallback(fn);
}

export async function withVisionFallback<T>(
  fn: (target: ChatTarget) => Promise<T>,
): Promise<T | null> {
  const primary = visionPrimary();
  if (!primary) {
    console.warn('[ai] vision: no primary client configured');
    return null;
  }
  try {
    return await fn(primary);
  } catch (err) {
    console.warn(`[ai] vision primary (${primary.label}/${primary.model}) failed:`, String(err).slice(0, 400));
    const fb = visionFallback();
    if (!fb) return null;
    try {
      return await fn(fb);
    } catch (err2) {
      console.warn(`[ai] vision fallback (${fb.label}/${fb.model}) failed:`, String(err2).slice(0, 400));
      return null;
    }
  }
}
