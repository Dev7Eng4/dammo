import { timedStep } from '../../../../../shared/timing/step-timer.js';
import { generateAiSceneVideoClips, type AiSceneVideoMode } from '../../../shared/ai-video/ai-video-scene-clip-generator.js';
import type { AiVideoScenePrompt } from '../../../shared/ai-video/ai-video.types.js';
import { toOnLog, type VideoTaskContext } from '../video-task.context.js';

/** Which scenes become Flow video clips for a channel's video type; `undefined` = images only. */
export function resolveSceneVideoMode(videoType: string | undefined): AiSceneVideoMode | undefined {
  if (videoType === 'ai_full_video') return 'full';
  if (videoType === 'ai_intro_video') return 'intro';
  return undefined;
}

/**
 * Image → video step. Runs after the scene images exist and turns the selected scenes into
 * Flow video clips; scenes that fail keep their image (Ken Burns fallback at assemble).
 */
export async function runSceneVideoClipsStep(
  ctx: VideoTaskContext,
  scenes: AiVideoScenePrompt[],
  mode: AiSceneVideoMode,
): Promise<AiVideoScenePrompt[]> {
  const { downloaded, workDir, log, stepTimer } = ctx;
  log.info(
    mode === 'full'
      ? 'Converting every scene image to a video clip via Flow...'
      : 'Converting the intro scene images to video clips via Flow...',
  );

  const result = await timedStep(
    'AI scene video clips',
    () =>
      generateAiSceneVideoClips({
        workDir,
        youtubeVideoId: downloaded.youtubeVideoId,
        scenes,
        mode,
        onLog: toOnLog(log),
      }),
    stepTimer,
  );

  log.ok(
    `AI video clips ready (${result.generatedCount}/${result.requestedCount}` +
      `${result.failedCount > 0 ? `, ${result.failedCount} kept as image` : ''})`,
  );
  return result.scenes;
}
