import type { SrtBlock } from '../../../../../infrastructure/subtitle/srt-utils.js';
import { srtTimestampToMs } from '../../../../../infrastructure/subtitle/srt-utils.js';

/** Videos at or under this duration use step1 → step3 (skip step2). */
export const DRAMA_SHORT_MAX_MS = 40 * 60 * 1000;
/** Short-path step1 uses only the first N minutes of transcript. */
export const DRAMA_SHORT_TRANSCRIPT_MS = 30 * 60 * 1000;
/** Long-path segment window for videos >40 min and <=1h30. */
export const DRAMA_SEGMENT_MS = 28 * 60 * 1000;
/** Very-long-path threshold: videos above this use wider segments. */
export const DRAMA_VERY_LONG_MIN_MS = 90 * 60 * 1000;
/** Long-path segment window for videos >1h30. */
export const DRAMA_VERY_LONG_SEGMENT_MS = 38 * 60 * 1000;
/** Overlap between consecutive long-path windows. */
export const DRAMA_OVERLAP_MS = 2 * 60 * 1000;

function resolveLongPathSegmentMs(durationMs: number): number {
  return durationMs > DRAMA_VERY_LONG_MIN_MS ? DRAMA_VERY_LONG_SEGMENT_MS : DRAMA_SEGMENT_MS;
}

export interface DramaTranscriptSegment {
  /** 1-based id string passed to prompt step 1, e.g. "seg-1". */
  id: string;
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

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
    .filter((block) => {
      const blockStart = srtTimestampToMs(block.start);
      return blockStart >= startMs && blockStart < endMs;
    })
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Build transcript windows for drama metadata.
 * - ≤40 min → one window of the first 30 minutes (or full duration if shorter)
 * - >40 min and ≤1h30 → 28-min windows with 2-min overlap (stride 26 min)
 * - >1h30 → 38-min windows with 2-min overlap (stride 36 min)
 */
export function buildDramaSegments(blocks: SrtBlock[], durationMs: number): DramaTranscriptSegment[] {
  if (durationMs <= 0 || blocks.length === 0) {
    return [];
  }

  if (durationMs <= DRAMA_SHORT_MAX_MS) {
    const endMs = Math.min(DRAMA_SHORT_TRANSCRIPT_MS, durationMs);
    const text = extractTranscriptText(blocks, 0, endMs);
    if (!text) return [];
    return [{ id: 'seg-1', index: 0, startMs: 0, endMs, text }];
  }

  const segmentMs = resolveLongPathSegmentMs(durationMs);
  const strideMs = segmentMs - DRAMA_OVERLAP_MS;
  const segments: DramaTranscriptSegment[] = [];
  let startMs = 0;
  let index = 0;

  while (startMs < durationMs) {
    const endMs = Math.min(startMs + segmentMs, durationMs);
    const text = extractTranscriptText(blocks, startMs, endMs);
    if (text) {
      segments.push({
        id: `seg-${index + 1}`,
        index,
        startMs,
        endMs,
        text,
      });
      index += 1;
    }

    if (endMs >= durationMs) break;
    startMs += strideMs;
  }

  return segments;
}
