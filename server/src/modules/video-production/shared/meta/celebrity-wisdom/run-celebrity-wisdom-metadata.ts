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
} from '../drama/drama-segments.js';
import {
  measureCelebrityWisdomStep1PromptShellLength,
  resolveCelebrityWisdomStepKey,
  runCelebrityWisdomStep1,
  runCelebrityWisdomStep2,
  withCelebrityWisdomLlmSession,
  type CelebrityWisdomMetadataProgress,
} from './celebrity-wisdom-steps.js';

export type { CelebrityWisdomMetadataProgress };

export interface RunCelebrityWisdomMetadataOptions extends Omit<RunMetadataOptions, 'onProgress'> {
  onProgress?: (progress: CelebrityWisdomMetadataProgress) => void;
}

/**
 * Celebrity wisdom niche metadata (2 steps):
 * 1. title + first ~1h30 transcript → content analysis JSON
 * 2. title + extractedJson → metadata + thumbnail.prompt (→ image_generation_prompt)
 */
export async function runCelebrityWisdomMetadata(
  sourceTitle: string,
  srtPath: string,
  language: PromptLanguage,
  videoId: string,
  options?: RunCelebrityWisdomMetadataOptions,
): Promise<VideoMetaOutput> {
  if (language !== 'ja') {
    throw new AppError(
      'Celebrity wisdom metadata generation is only supported for Japanese',
      400,
      'UNSUPPORTED_LANGUAGE',
    );
  }

  const step1Key = resolveCelebrityWisdomStepKey(language, 1);
  const shellLen = await measureCelebrityWisdomStep1PromptShellLength(language, step1Key);
  const maxChars = computeStep1MaxTranscriptChars(shellLen);
  if (maxChars === 0) {
    throw new AppError(
      `Celebrity wisdom step 1 prompt shell (${shellLen} chars) exceeds input budget`,
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
      'No SRT transcript content available for celebrity wisdom metadata',
      400,
      'INVALID_INPUT',
    );
  }

  const title = sourceTitle.trim();
  const stepOptions = { onProgress: options?.onProgress, outputDir: options?.outputDir };
  const windowMin = Math.min(durationMs, DRAMA_STEP1_MAX_TRANSCRIPT_MS) / 60_000;

  console.log(
    `[celebrity-wisdom-metadata] duration=${(durationMs / 60_000).toFixed(1)}min ` +
      `step1_window=${windowMin.toFixed(1)}min shell=${shellLen} maxChars=${maxChars} ` +
      `chars=${transcript.length}/${maxChars}`,
  );

  const parsed = await withCelebrityWisdomLlmSession(async session => {
    const extractedJson = await runCelebrityWisdomStep1(session, language, title, transcript, stepOptions);
    return runCelebrityWisdomStep2(session, language, title, extractedJson, stepOptions);
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
