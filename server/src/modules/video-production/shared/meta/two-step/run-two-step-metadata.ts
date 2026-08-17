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
import { getTwoStepNicheConfig } from './two-step-niche.config.js';
import {
  runTwoStepStep1,
  runTwoStepStep2,
  withTwoStepLlmSession,
  type TwoStepMetadataProgress,
} from './two-step-steps.js';

export type { TwoStepMetadataProgress };

export interface RunTwoStepMetadataOptions extends Omit<RunMetadataOptions, 'onProgress'> {
  onProgress?: (progress: TwoStepMetadataProgress) => void;
}

/**
 * Shared 2-step niche metadata (philosophy healing, retirement finance, …):
 * 1. First 1h30 of transcript (capped at 28_000 chars) → niche extraction / visual DNA
 * 2. extractedJson + title + imageStyle → metadata + image prompts
 */
export async function runTwoStepNicheMetadata(
  sourceTitle: string,
  srtPath: string,
  language: PromptLanguage,
  videoId: string,
  options?: RunTwoStepMetadataOptions,
): Promise<VideoMetaOutput> {
  const config = getTwoStepNicheConfig(language, options?.niche);
  if (!config) {
    throw new AppError(
      `No 2-step metadata config for niche "${options?.niche ?? ''}"`,
      400,
      'INVALID_INPUT',
    );
  }

  if (language !== 'ja') {
    throw new AppError(
      `${config.logLabel} metadata generation is only supported for Japanese`,
      400,
      'UNSUPPORTED_LANGUAGE',
    );
  }

  const imageStyle = options?.imageStyle?.trim() ?? '';
  if (!imageStyle) {
    throw new AppError(
      `Phong cách hình ảnh (visual style) is required for ${config.logLabel} metadata (image_style)`,
      400,
      'MISSING_IMAGE_STYLE',
    );
  }

  const content = await fs.readFile(srtPath, 'utf8');
  const blocks = parseSrt(content);
  const durationMs = getSrtDurationMs(blocks);
  const transcript = extractDramaStep1Transcript(blocks);

  if (!transcript) {
    throw new AppError(
      `No SRT transcript content available for ${config.logLabel} metadata`,
      400,
      'INVALID_INPUT',
    );
  }

  const title = sourceTitle.trim();
  const stepOptions = { onProgress: options?.onProgress };
  const windowMin = Math.min(durationMs, DRAMA_STEP1_MAX_TRANSCRIPT_MS) / 60_000;

  console.log(
    `[${config.logLabel}-metadata] duration=${(durationMs / 60_000).toFixed(1)}min ` +
      `step1_window=${windowMin.toFixed(1)}min chars=${transcript.length}/${DRAMA_STEP1_MAX_CHARS}`,
  );

  const parsed = await withTwoStepLlmSession(config, async session => {
    const extractedJson = await runTwoStepStep1(session, language, config, transcript, stepOptions);
    return runTwoStepStep2(session, language, config, title, extractedJson, imageStyle, stepOptions);
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
