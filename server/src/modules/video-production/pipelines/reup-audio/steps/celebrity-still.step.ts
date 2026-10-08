import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../../../../shared/http/errors.js';
import { getAudioDurationSeconds } from '../../../../../infrastructure/ffmpeg/ffmpeg-probe.js';
import { materializeStillJpeg } from '../../../../../infrastructure/ffmpeg/image-resize.js';
import { resolveAiRenderConfig } from '../../../shared/ai-video/ai-render-config.js';
import { AI_SLIDES_DIRNAME } from '../../../shared/ai-video/ai-video.constants.js';
import { msToSrtTimestamp } from '../../../shared/ai-video/ai-video-scene-timing.js';
import { persistAiScenePromptsFile } from '../../../shared/ai-video/ai-video-scene-prompts-store.js';
import type { AiVideoScenePrompt } from '../../../shared/ai-video/ai-video.types.js';
import { pickRandomCelebrityImagePath } from '../../../shared/celebrity-image.js';
import { isCelebrityWisdomNiche } from '../../../shared/meta/metadata.types.js';
import type { ProductionDestination } from '../../../ports/production-destination.port.js';
import { toOnLog, type VideoTaskContext } from '../video-task.context.js';
import type { SceneAssetsResult } from './scene-assets.step.js';

const STILL_SCENE_RELATIVE_PATH = path.posix.join(AI_SLIDES_DIRNAME, 'scene-001.jpg');

/**
 * AI channel in the celebrity-wisdom niche: never generate scene prompts/images; show one
 * celebrity image on a black background for the whole video.
 */
export function usesCelebrityStillBackground(
  destination: Pick<ProductionDestination, 'reupAudioVideoType' | 'niche'>,
): boolean {
  return destination.reupAudioVideoType === 'ai' && isCelebrityWisdomNiche(destination.niche);
}

/**
 * Stored as a single full-length scene in the usual scene files, so reassembly from disk
 * and scene regeneration need no special casing.
 */
export async function runCelebrityStillStep(ctx: VideoTaskContext): Promise<SceneAssetsResult> {
  const { destination, downloaded, workDir, log } = ctx;
  const celebrityId = destination.celebrityId?.trim();
  if (!celebrityId) {
    throw new AppError(
      'Celebrity is required for AI videos in the celebrity-wisdom niche',
      400,
      'VALIDATION_ERROR',
    );
  }

  const sourcePath = pickRandomCelebrityImagePath(celebrityId);
  log.info(`Celebrity still background: ${path.basename(sourcePath)} (celebrity ${celebrityId})`);
  const stillPath = path.join(workDir, STILL_SCENE_RELATIVE_PATH);
  await fs.mkdir(path.dirname(stillPath), { recursive: true });
  await materializeStillJpeg(sourcePath, stillPath, toOnLog(log));

  await resolveAiRenderConfig(workDir, { kenBurns: false });

  const durationSec = await getAudioDurationSeconds(downloaded.audioPath);
  const scene: AiVideoScenePrompt = {
    prompt: '',
    startTime: msToSrtTimestamp(0),
    endTime: msToSrtTimestamp(durationSec * 1_000),
    path: STILL_SCENE_RELATIVE_PATH,
  };
  const promptsPath = await persistAiScenePromptsFile(workDir, downloaded.youtubeVideoId, [scene]);

  return { scenes: [scene], promptsPath, slidesDir: path.join(workDir, AI_SLIDES_DIRNAME) };
}
