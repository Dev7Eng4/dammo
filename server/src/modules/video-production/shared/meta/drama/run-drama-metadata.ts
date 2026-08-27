import fs from 'node:fs/promises';
import { parseSrt } from '../../../../../infrastructure/subtitle/srt-utils.js';
import { AppError } from '../../../../../shared/http/errors.js';
import type { PromptLanguage } from '../../../../prompts/prompts.types.js';
import {
  persistMetadataOutput,
  toVideoMetaOutput,
  type RunMetadataOptions,
} from '../run-metadata.js';
import type { VideoMetaOutput } from '../metadata.types.js';
import {
  DRAMA_STEP1_MAX_CHARS,
  DRAMA_STEP1_MAX_TRANSCRIPT_MS,
  extractDramaStep1Transcript,
  getSrtDurationMs,
} from './drama-segments.js';
import {
  runDramaStep1,
  runDramaStep2,
  withDramaLlmSession,
  type DramaMetadataProgress,
} from './drama-steps.js';

export type { DramaMetadataProgress };

export interface RunDramaMetadataOptions extends Omit<RunMetadataOptions, 'onProgress'> {
  onProgress?: (progress: DramaMetadataProgress) => void;
}

/**
 * Drama niche metadata (2 steps):
 * 1. First 1h30 of transcript (capped at 28_000 chars) → narrative extraction
 * 2. extractedStoryJson + title + imageStyle → metadata + image prompts
 */
export async function runDramaMetadata(
  sourceTitle: string,
  srtPath: string,
  language: PromptLanguage,
  videoId: string,
  options?: RunDramaMetadataOptions,
): Promise<VideoMetaOutput> {
  if (language !== 'ja') {
    throw new AppError('Drama metadata generation is only supported for Japanese', 400, 'UNSUPPORTED_LANGUAGE');
  }

  const imageStyle = options?.imageStyle?.trim() ?? '';
  if (!imageStyle) {
    throw new AppError(
      'Phong cách hình ảnh (visual style) is required for drama metadata (image_style)',
      400,
      'MISSING_IMAGE_STYLE',
    );
  }

  const content = await fs.readFile(srtPath, 'utf8');
  const blocks = parseSrt(content);
  const durationMs = getSrtDurationMs(blocks);
  const transcript = extractDramaStep1Transcript(blocks);

  if (!transcript) {
    throw new AppError('No SRT transcript content available for drama metadata', 400, 'INVALID_INPUT');
  }

  const title = sourceTitle.trim();
  const stepOptions = { onProgress: options?.onProgress, outputDir: options?.outputDir };
  const windowMin = Math.min(durationMs, DRAMA_STEP1_MAX_TRANSCRIPT_MS) / 60_000;

  console.log(
    `[drama-metadata] duration=${(durationMs / 60_000).toFixed(1)}min ` +
      `step1_window=${windowMin.toFixed(1)}min chars=${transcript.length}/${DRAMA_STEP1_MAX_CHARS}`,
  );

  const parsed = await withDramaLlmSession(async (session) => {
    const extractedStoryJson = await runDramaStep1(session, language, transcript, stepOptions);
    return runDramaStep2(session, language, title, extractedStoryJson, imageStyle, stepOptions);
  });

  await persistMetadataOutput(
    parsed,
    sourceTitle,
    videoId,
    language,
    options?.outputDir,
    options?.descriptionDisclaimer,
  );

  return toVideoMetaOutput(parsed, sourceTitle, options?.descriptionDisclaimer);
}
