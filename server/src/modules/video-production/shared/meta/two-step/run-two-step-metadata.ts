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
  DRAMA_STEP1_MAX_TRANSCRIPT_MS,
  computeStep1MaxTranscriptChars,
  extractDramaStep1Transcript,
  getSrtDurationMs,
  measureStep1PromptShellLength,
} from '../drama/drama-segments.js';
import { getTwoStepNicheConfig } from './two-step-niche.config.js';
import {
  resolveTwoStepKey,
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
 * 1. First 1h30 of transcript (chars budget = 31000 - step1 prompt shell) → niche extraction
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

  const step1Key = resolveTwoStepKey(language, config, 1);
  const shellLen = await measureStep1PromptShellLength(language, step1Key);
  const maxChars = computeStep1MaxTranscriptChars(shellLen);
  if (maxChars === 0) {
    throw new AppError(
      `${config.logLabel} step 1 prompt shell (${shellLen} chars) exceeds input budget`,
      400,
      'PROMPT_TOO_LONG',
    );
  }

  const content = await fs.readFile(srtPath, 'utf8');
  const blocks = parseSrt(content);
  const durationMs = getSrtDurationMs(blocks);
  const transcript = extractDramaStep1Transcript(blocks, maxChars);

  if (!transcript) {
    throw new AppError(
      `No SRT transcript content available for ${config.logLabel} metadata`,
      400,
      'INVALID_INPUT',
    );
  }

  const title = sourceTitle.trim();
  const stepOptions = { onProgress: options?.onProgress, outputDir: options?.outputDir };
  const windowMin = Math.min(durationMs, DRAMA_STEP1_MAX_TRANSCRIPT_MS) / 60_000;

  console.log(
    `[${config.logLabel}-metadata] duration=${(durationMs / 60_000).toFixed(1)}min ` +
      `step1_window=${windowMin.toFixed(1)}min shell=${shellLen} maxChars=${maxChars} ` +
      `chars=${transcript.length}/${maxChars}`,
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
