import { timedStep } from '../../../../../shared/timing/step-timer.js';
import { assembleReupAiSlideshowVideo } from '../../../shared/ai-video/index.js';
import { runSceneAssetsStep } from '../steps/scene-assets.step.js';
import { toOnLog, type AssembleContext } from '../video-task.context.js';
import type { AssembleReadiness, VideoTypeStrategy, VisualAssets } from './video-type.strategy.js';

function timedScenesOf(assets: VisualAssets) {
  return (assets.aiScenePrompts ?? []).filter(scene => Boolean(scene.path?.trim()));
}

export const aiStrategy: VideoTypeStrategy = {
  type: 'ai',

  /* AI generates its thumbnail through the normal thumbnail flow. */
  async tryCombinedThumbnailBatch() {
    return null;
  },

  async prepareEnrichedVisuals() {
    return {};
  },

  async prepareSceneAssets(ctx) {
    const result = await runSceneAssetsStep(ctx, { label: 'AI' });

    return {
      aiScenePrompts: result.scenes,
      aiScenePromptsPath: result.promptsPath,
      aiSlidesDir: result.slidesDir,
    };
  },

  async canAssemble(_ctx, assets): Promise<AssembleReadiness> {
    if (timedScenesOf(assets).length === 0) {
      console.warn('[reup-video] AI video assembly skipped: no scene images');
      return { ready: false, reason: 'AI video assembly skipped: no scene images' };
    }

    return { ready: true };
  },

  async assemble(ctx: AssembleContext, assets) {
    const { destination, log, outputBasename } = ctx;
    const timedScenes = timedScenesOf(assets);

    ctx.beginRenderPhase?.();
    log.info(`Assembling AI slideshow (${timedScenes.length} timed slides + captions)...`);

    const outputPath = await timedStep(
      'AI assemble video',
      () =>
        assembleReupAiSlideshowVideo({
          workDir: ctx.workDir,
          scenes: timedScenes,
          audioPath: ctx.audioPath,
          subtitlePath: ctx.subtitlePath,
          language: destination.language,
          captionStyleKey: destination.captionStyleKey,
          outputBasename,
          showDisclaim: ctx.showDisclaim,
          disclaimerText: ctx.disclaimerText,
          ...(ctx.channelAvatarPath ? { channelAvatarPath: ctx.channelAvatarPath } : {}),
          ...(destination.showSmallVideo || destination.smallVideoFile
            ? {
                showSmallVideo: destination.showSmallVideo,
                ...(destination.smallVideoFile ? { smallVideoFile: destination.smallVideoFile } : {}),
              }
            : {}),
          onLog: toOnLog(log),
        }),
      ctx.stepTimer,
    );

    log.ok(`AI video saved → ${outputBasename}.mp4`);
    return outputPath;
  },
};
