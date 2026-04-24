import fs from 'node:fs';
import { audioClient } from './openai.js';

export async function transcribeAudio(filePath: string): Promise<string | null> {
  const client = audioClient();
  if (!client) return null;
  try {
    const res = await client.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-1',
    });
    return res.text.trim();
  } catch {
    return null;
  }
}
