import fs from 'node:fs/promises';
import path from 'node:path';
import { withVisionFallback } from './openai.js';

const SYSTEM = `You turn photos into kanban cards. Reply as JSON with exactly two fields: "title" (one concise sentence, <60 chars) and "description" (optional short details, max 2 lines). If the image is a list, extract items into description as bullets. If it's an object or scene, suggest the action it implies. Return ONLY JSON, no prose.`;

export type VisionResult = { title: string; description: string };

export async function summarizeImage(filePath: string): Promise<VisionResult | null> {
  const buf = await fs.readFile(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase() || 'jpeg';
  const dataUrl = `data:image/${ext};base64,${buf.toString('base64')}`;

  return withVisionFallback(async ({ client, model }) => {
    const res = await client.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Create a kanban card from this image.' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    });
    const choiceErr = (res.choices[0] as unknown as { error?: { message?: string } })?.error;
    if (choiceErr) throw new Error(`provider: ${choiceErr.message ?? 'error'}`);
    const text = res.choices[0]?.message?.content?.trim();
    if (!text) throw new Error('empty response');
    const parsed = JSON.parse(text) as Partial<VisionResult>;
    const title = String(parsed.title ?? '').trim().slice(0, 120);
    if (!title) throw new Error('no title');
    return { title, description: String(parsed.description ?? '').trim() };
  });
}
