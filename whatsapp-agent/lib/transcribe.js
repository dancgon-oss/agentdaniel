import OpenAI from 'openai';
import fs from 'node:fs';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export async function transcribeAudio(filePath) {
  if (!openai) return null;

  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: 'whisper-1',
    language: 'pt',
  });

  return transcription.text?.trim() || null;
}
