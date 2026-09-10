import type { SrtBlock } from '../../../../../infrastructure/subtitle/srt-utils.js';
import { srtTimestampToMs } from '../../../../../infrastructure/subtitle/srt-utils.js';
import { executePromptTemplate } from '../../../../prompts/prompts.file-store.js';
import type { PromptLanguage } from '../../../../prompts/prompts.types.js';

/** Step 1 uses at most the first 1h30 of transcript. */
export const DRAMA_STEP1_MAX_TRANSCRIPT_MS = 90 * 60 * 1000;

/**
 * Soft budget for the full step-1 chat input (prompt shell + transcript).
 * Kept under the ~32k chat paste limit with a small margin.
 */
export const STEP1_PROMPT_INPUT_BUDGET = 31_000;

/** @deprecated Use STEP1_PROMPT_INPUT_BUDGET / computeStep1MaxTranscriptChars instead. */
export const DRAMA_STEP1_MAX_CHARS = STEP1_PROMPT_INPUT_BUDGET;

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

/** Remaining transcript chars after accounting for the rendered step-1 prompt shell. */
export function computeStep1MaxTranscriptChars(promptShellLength: number): number {
  return Math.max(0, STEP1_PROMPT_INPUT_BUDGET - Math.max(0, promptShellLength));
}

/** Render step-1 template with an empty transcript to measure the fixed prompt shell size. */
export async function measureStep1PromptShellLength(
  language: PromptLanguage,
  step1Key: string,
): Promise<number> {
  const shell = await executePromptTemplate(language, step1Key, ['']);
  return shell.length;
}

/**
 * Extract the first 1h30 of SRT cues, then truncate to at most `maxChars`
 * (drop excess from the end) for metadata step 1.
 */
export function extractDramaStep1Transcript(blocks: SrtBlock[], maxChars: number): string {
  if (blocks.length === 0 || maxChars <= 0) return '';

  const text = extractTranscriptText(blocks, 0, DRAMA_STEP1_MAX_TRANSCRIPT_MS);
  if (!text) return '';

  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}
