import fs from 'node:fs/promises';
import path from 'node:path';
import { YoutubeTranscript } from 'youtube-transcript';
import { AppError } from '../../../shared/http/errors.js';
import { requireYoutubeVideoId } from '../youtube-url.js';
import type { TranscriptLanguage } from '../youtube-transcript-downloader.js';

function msToVttTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function escapeVtt(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toVtt(
  transcript: Array<{ text: string; offset: number; duration: number }>,
): string | null {
  const cues: string[] = [];
  for (const line of transcript) {
    const text = line.text?.trim();
    if (!text) continue;
    const startMs = Number(line.offset);
    const endMs = Number(line.offset + line.duration);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    cues.push(`${msToVttTime(startMs)} --> ${msToVttTime(endMs)}\n${escapeVtt(text)}`);
  }
  if (!cues.length) return null;
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

export async function downloadYoutubeTranscriptWithYoutubeTranscriptApi(
  url: string,
  outputDir: string,
  language: TranscriptLanguage,
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const videoId = requireYoutubeVideoId(url);

  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: language });
    const vtt = toVtt(transcript);
    if (!vtt) {
      throw new AppError(
        `Transcript not found for language "${language}"`,
        404,
        'TRANSCRIPT_NOT_FOUND',
      );
    }

    const canonicalPath = path.join(outputDir, `transcript.${language}.vtt`);
    await fs.writeFile(canonicalPath, vtt, 'utf8');
    return canonicalPath;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new AppError(`Failed to download transcript via youtube-transcript: ${message}`, 500);
  }
}
