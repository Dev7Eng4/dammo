import fs from 'node:fs/promises';
import path from 'node:path';
import { cleanSrt } from '../../infrastructure/subtitle/clean-srt.js';
import { transcriptToPlainText } from '../script-remake/script-remake.service.js';

/**
 * Source transcripts follow the Reup audio flow: the YouTube VTT is downloaded, `cleanSrt` turns it
 * into a clean SRT (rolling-caption repeats dropped, timing kept) saved next to it, and only the
 * steps that need prose (remake, script writing, similarity) flatten that SRT to text when they run.
 */

/** Cleans a downloaded VTT into `<name>.srt` beside it and returns the SRT path. */
export async function cleanSourceTranscript(vttPath: string): Promise<string> {
  return cleanSrt(vttPath);
}

async function findIn(dir: string, extension: string): Promise<string | undefined> {
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const name = names.find(item => item.toLowerCase().endsWith(extension));
  return name ? path.join(dir, name) : undefined;
}

/**
 * A source's clean SRT. Sources loaded before this flow point at a flattened `<videoId>.txt`; their
 * VTT is still in `sources/<videoId>/`, so it is cleaned on first use.
 */
export async function resolveSourceSrt(source: { videoId: string; transcriptPath: string }): Promise<string | null> {
  if (source.transcriptPath.toLowerCase().endsWith('.srt')) return source.transcriptPath;
  const dir = path.join(path.dirname(source.transcriptPath), source.videoId);
  const srt = await findIn(dir, '.srt');
  if (srt) return srt;
  const vtt = await findIn(dir, '.vtt');
  return vtt ? cleanSourceTranscript(vtt) : null;
}

/** The source transcript as one block of prose, read from its clean SRT. */
export async function readSourceTranscript(source: { videoId: string; transcriptPath: string }): Promise<string> {
  const srt = await resolveSourceSrt(source);
  const raw = await fs.readFile(srt ?? source.transcriptPath, 'utf8').catch(() => '');
  return transcriptToPlainText(raw);
}
