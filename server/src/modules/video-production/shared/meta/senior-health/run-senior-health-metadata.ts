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
} from '../drama/drama-segments.js';
import {
  runSeniorHealthStep1,
  runSeniorHealthStep2,
  withSeniorHealthLlmSession,
  type SeniorHealthMetadataProgress,
} from './senior-health-steps.js';

export type { SeniorHealthMetadataProgress };

export interface RunSeniorHealthMetadataOptions extends Omit<RunMetadataOptions, 'onProgress'> {
  onProgress?: (progress: SeniorHealthMetadataProgress) => void;
}

/**
 * Senior-health niche metadata (2 steps):
 * 1. First 1h30 of transcript (capped at 28_000 chars) → knowledge / visual DNA extraction
 * 2. extractedHealthJson + title + imageStyle → metadata + thumbnail prompt (no general_background)
 */
export async function runSeniorHealthMetadata(
  sourceTitle: string,
  srtPath: string,
  language: PromptLanguage,
  videoId: string,
  options?: RunSeniorHealthMetadataOptions,
): Promise<VideoMetaOutput> {
  if (language !== 'ja') {
    throw new AppError(
      'Senior health metadata generation is only supported for Japanese',
      400,
      'UNSUPPORTED_LANGUAGE',
    );
  }

  const imageStyle = options?.imageStyle?.trim() ?? '';
  if (!imageStyle) {
    throw new AppError(
      'Phong cách hình ảnh (visual style) is required for senior health metadata (image_style)',
      400,
      'MISSING_IMAGE_STYLE',
    );
  }

  const content = await fs.readFile(srtPath, 'utf8');
  const blocks = parseSrt(content);
  const durationMs = getSrtDurationMs(blocks);
  const transcript = extractDramaStep1Transcript(blocks);

  if (!transcript) {
    throw new AppError('No SRT transcript content available for senior health metadata', 400, 'INVALID_INPUT');
  }

  const title = sourceTitle.trim();
  const stepOptions = { onProgress: options?.onProgress, outputDir: options?.outputDir };
  const windowMin = Math.min(durationMs, DRAMA_STEP1_MAX_TRANSCRIPT_MS) / 60_000;

  console.log(
    `[senior-health-metadata] duration=${(durationMs / 60_000).toFixed(1)}min ` +
      `step1_window=${windowMin.toFixed(1)}min chars=${transcript.length}/${DRAMA_STEP1_MAX_CHARS}`,
  );

  const parsed = await withSeniorHealthLlmSession(async (session) => {
    const extractedHealthJson = await runSeniorHealthStep1(session, language, transcript, stepOptions);
    return runSeniorHealthStep2(session, language, title, extractedHealthJson, imageStyle, stepOptions);
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
