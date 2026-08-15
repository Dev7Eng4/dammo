import type { SrtBlock } from '../../../../../infrastructure/subtitle/srt-utils.js';
import { srtTimestampToMs } from '../../../../../infrastructure/subtitle/srt-utils.js';

/** Step 1 uses at most the first 1h30 of transcript. */
export const DRAMA_STEP1_MAX_TRANSCRIPT_MS = 90 * 60 * 1000;
/** Soft cap on transcript character length passed to step 1 prompt. */
export const DRAMA_STEP1_MAX_CHARS = 28_000;

export function getSrtDurationMs(blocks: SrtBlock[]): number {
  let maxMs = 0;
  for (const block of blocks) {
    const endMs = srtTimestampToMs(block.end);
    if (endMs > maxMs) maxMs = endMs;
  }
  return maxMs;
}

/** Join cue text for blocks whose start time falls in `[startMs, endMs)`. */
export function extractTranscriptText(blocks: SrtBlock[], startMs: number, endMs: number): string {
  if (endMs <= startMs) return '';

  return blocks
    .filter(block => {
      const blockStart = srtTimestampToMs(block.start);
      return blockStart >= startMs && blockStart < endMs;
    })
    .map(block => block.text.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Extract the first 1h30 of SRT cues, then truncate to at most 28_000 characters
 * (drop excess from the end) for drama metadata step 1.
 */
export function extractDramaStep1Transcript(blocks: SrtBlock[]): string {
  if (blocks.length === 0) return '';

  const text = extractTranscriptText(blocks, 0, DRAMA_STEP1_MAX_TRANSCRIPT_MS);
  if (!text) return '';

  if (text.length <= DRAMA_STEP1_MAX_CHARS) return text;
  return text.slice(0, DRAMA_STEP1_MAX_CHARS);
}
