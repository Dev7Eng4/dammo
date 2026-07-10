import fs from 'node:fs/promises';
import {
  parseSrt,
  srtTimestampToMs,
  type SrtBlock,
} from '../../../../infrastructure/subtitle/srt-utils.js';
import { getAudioDurationSeconds } from '../../../../infrastructure/ffmpeg/ffmpeg-probe.js';
import { AppError } from '../../../../shared/http/errors.js';
import {
  AI_VIDEO_DENSITY_TIERS,
  AI_VIDEO_TRANSCRIPT_CHUNK_MAX_SEC,
  type AiVideoDensityTier,
} from './ai-video.constants.js';
import type { TranscriptCue } from './ai-video.types.js';

export interface TranscriptDensitySegments {
  high: TranscriptCue[];
  medium: TranscriptCue[];
  low: TranscriptCue[];
}

export function srtBlocksToTranscriptCues(blocks: SrtBlock[]): TranscriptCue[] {
  return blocks.map(block => ({
    text: block.text,
    startTime: block.start,
    endTime: block.end,
  }));
}

export function resolveDensityTier(totalDurationSec: number): AiVideoDensityTier {
  for (const tier of AI_VIDEO_DENSITY_TIERS) {
    if (tier.maxDurationSec === undefined || totalDurationSec <= tier.maxDurationSec) {
      return tier;
    }
  }

  return AI_VIDEO_DENSITY_TIERS[AI_VIDEO_DENSITY_TIERS.length - 1];
}

function takeCuesWithinBudget(cues: TranscriptCue[], budgetSec: number): TranscriptCue[] {
  if (cues.length === 0 || budgetSec <= 0) {
    return [];
  }

  const budgetMs = budgetSec * 1000;
  const selected: TranscriptCue[] = [];

  for (const cue of cues) {
    const endMs = srtTimestampToMs(cue.endTime);
    if (selected.length === 0) {
      if (endMs > budgetMs) {
        break;
      }
      selected.push(cue);
      continue;
    }

    if (endMs > budgetMs) {
      break;
    }

    selected.push(cue);
  }

  return selected;
}

export function splitTranscriptByDensity(
  cues: TranscriptCue[],
  totalDurationSec: number,
  tier: AiVideoDensityTier,
): TranscriptDensitySegments {
  if (cues.length === 0) {
    return { high: [], medium: [], low: [] };
  }

  const highBudgetSec = (totalDurationSec * tier.highDensity) / 100;
  const mediumBudgetSec = (totalDurationSec * tier.mediumDensity) / 100;

  const high = takeCuesWithinBudget(cues, highBudgetSec);
  const remainingAfterHigh = cues.slice(high.length);
  const medium = takeCuesWithinBudget(remainingAfterHigh, mediumBudgetSec);
  const low = remainingAfterHigh.slice(medium.length);

  return { high, medium, low };
}

export function chunkTranscriptByMaxSpan(
  cues: TranscriptCue[],
  maxSpanSec = AI_VIDEO_TRANSCRIPT_CHUNK_MAX_SEC,
): TranscriptCue[][] {
  if (cues.length === 0) {
    return [];
  }

  const maxSpanMs = maxSpanSec * 1000;
  const chunks: TranscriptCue[][] = [];
  let current: TranscriptCue[] = [];
  let chunkStartMs = srtTimestampToMs(cues[0].startTime);

  for (const cue of cues) {
    const cueStartMs = srtTimestampToMs(cue.startTime);
    const cueEndMs = srtTimestampToMs(cue.endTime);

    if (current.length === 0) {
      chunkStartMs = cueStartMs;
      current.push(cue);
      continue;
    }

    const spanMs = cueEndMs - chunkStartMs;
    if (spanMs > maxSpanMs) {
      chunks.push(current);
      current = [cue];
      chunkStartMs = cueStartMs;
      continue;
    }

    current.push(cue);
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

export function resolveTranscriptDurationSec(cues: TranscriptCue[]): number {
  if (cues.length === 0) {
    return 0;
  }

  const lastEndMs = srtTimestampToMs(cues[cues.length - 1].endTime);
  return lastEndMs / 1000;
}

export async function loadTranscriptCuesFromSrt(subtitlePath: string): Promise<TranscriptCue[]> {
  const content = await fs.readFile(subtitlePath, 'utf8');
  const blocks = parseSrt(content);

  if (blocks.length === 0) {
    throw new AppError('No SRT blocks found in subtitle file', 400, 'INVALID_INPUT');
  }

  return srtBlocksToTranscriptCues(blocks);
}

export async function resolveTotalDurationSec(
  cues: TranscriptCue[],
  audioPath?: string,
): Promise<number> {
  if (audioPath) {
    try {
      await fs.access(audioPath);
      const audioDurationSec = await getAudioDurationSeconds(audioPath);
      if (Number.isFinite(audioDurationSec) && audioDurationSec > 0) {
        return audioDurationSec;
      }
    } catch {
      // fall back to transcript duration
    }
  }

  const transcriptDurationSec = resolveTranscriptDurationSec(cues);
  if (transcriptDurationSec <= 0) {
    throw new AppError('Unable to resolve video duration from audio or transcript', 400, 'INVALID_INPUT');
  }

  return transcriptDurationSec;
}

export async function prepareTranscriptDensityChunks(
  subtitlePath: string,
  audioPath?: string,
): Promise<{
  totalDurationSec: number;
  tier: AiVideoDensityTier;
  segments: TranscriptDensitySegments;
  chunks: {
    high: TranscriptCue[][];
    medium: TranscriptCue[][];
    low: TranscriptCue[][];
  };
}> {
  const cues = await loadTranscriptCuesFromSrt(subtitlePath);
  const totalDurationSec = await resolveTotalDurationSec(cues, audioPath);
  const tier = resolveDensityTier(totalDurationSec);
  const segments = splitTranscriptByDensity(cues, totalDurationSec, tier);

  return {
    totalDurationSec,
    tier,
    segments,
    chunks: {
      high: chunkTranscriptByMaxSpan(segments.high),
      medium: chunkTranscriptByMaxSpan(segments.medium),
      low: chunkTranscriptByMaxSpan(segments.low),
    },
  };
}
