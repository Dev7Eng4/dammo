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
  buildDramaSegments,
  DRAMA_SHORT_MAX_MS,
  getSrtDurationMs,
} from './drama-segments.js';
import {
  runDramaStep1,
  runDramaStep1Parallel,
  runDramaStep2,
  runDramaStep3,
  withDramaLlmSession,
  type DramaMetadataProgress,
} from './drama-steps.js';

export type { DramaMetadataProgress };

export interface RunDramaMetadataOptions extends Omit<RunMetadataOptions, 'onProgress'> {
  onProgress?: (progress: DramaMetadataProgress) => void;
}

/**
 * Drama niche metadata:
 * - ≤40 min: step1 (first 30 min transcript) → step3
 * - >40 min: overlapping segments over at most the first 2h → parallel step1 (max 7) → step2 → step3
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
  const segments = buildDramaSegments(blocks, durationMs);

  if (segments.length === 0) {
    throw new AppError('No SRT transcript content available for drama metadata', 400, 'INVALID_INPUT');
  }

  const title = sourceTitle.trim();
  const isShort = durationMs <= DRAMA_SHORT_MAX_MS;
  const stepOptions = { onProgress: options?.onProgress };

  console.log(
    `[drama-metadata] duration=${(durationMs / 60_000).toFixed(1)}min path=${isShort ? 'short' : 'long'} segments=${segments.length}`,
  );

  const parsed = isShort
    ? await withDramaLlmSession(async (session) => {
        const analysis = await runDramaStep1(session, language, segments[0]!, segments.length, stepOptions);
        return runDramaStep3(
          session,
          language,
          title,
          JSON.stringify(analysis),
          imageStyle,
          stepOptions,
        );
      })
    : await (async () => {
        const analyses = await runDramaStep1Parallel(language, segments, stepOptions);
        return withDramaLlmSession(async (session) => {
          const dossier = await runDramaStep2(session, language, analyses, stepOptions);
          return runDramaStep3(
            session,
            language,
            title,
            JSON.stringify(dossier),
            imageStyle,
            stepOptions,
          );
        });
      })();

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
