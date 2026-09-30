import { appSettingsService } from '../../../../app-settings/app-settings.service.js';
import { AppError } from '../../../../../shared/http/errors.js';
import { timedStep } from '../../../../../shared/timing/step-timer.js';
import { promptsRepository } from '../../../../prompts/prompts.repository.js';
import { promptsSettingsService } from '../../../../prompts/prompts-settings.service.js';
import {
  generateAiScenePromptsForPipeline,
  generateAiSceneSlideImages,
} from '../../../shared/ai-video/index.js';
import { resolveAiRenderConfig } from '../../../shared/ai-video/ai-render-config.js';
import type { AiVideoScenePrompt } from '../../../shared/ai-video/ai-video.types.js';
import { isKenBurnsEnabled } from '../../../shared/slideshow/slideshow.constants.js';
import { toOnLog, type VideoTaskContext } from '../video-task.context.js';

export interface SceneAssetsResult {
  scenes: AiVideoScenePrompt[];
  promptsPath: string;
  slidesDir: string;
}

/**
 * Scene prompts + scene images. Shared by the AI slideshow and by SI in
 * `multi_image` mode (which only differs by the transcript window it feeds the LLM).
 */
export async function runSceneAssetsStep(
  ctx: VideoTaskContext,
  options: { label: string; maxTranscriptSec?: number },
): Promise<SceneAssetsResult> {
  const { destination, downloaded, subtitlePath, workDir, log, stepTimer } = ctx;

  if (!destination.visualStyle) {
    throw new AppError(
      `Reup Audio ${options.label} channel is missing visual style`,
      400,
      'VALIDATION_ERROR',
    );
  }

  const useReferenceImage = destination.useReferenceImage === true;
  const flowMode = useReferenceImage ? 'có ảnh tham chiếu' : 'không ảnh tham chiếu';
  const sceneImageFlow = promptsRepository.findImageSceneFlow(destination.niche, useReferenceImage);
  if (!sceneImageFlow) {
    throw new AppError(
      `Không tìm thấy luồng prompt tạo ảnh ${flowMode} cho niche "${destination.niche}" và niche "all"`,
      400,
      'IMAGE_SCENE_FLOW_NOT_FOUND',
    );
  }
  const fellBack = destination.niche !== 'all' && sceneImageFlow.niche === 'all';
  log.info(
    `${options.label} image flow (${flowMode}): "${sceneImageFlow.setName}"` +
      (fellBack ? ` — niche "${destination.niche}" chưa có luồng riêng, dùng luồng all` : ''),
  );

  log.info(
    useReferenceImage
      ? `Generating ${options.label} scene prompts with character references via LLM...`
      : `Generating ${options.label} scene prompts via LLM...`,
  );

  const promptResult = await timedStep(
    `${options.label} scene prompts`,
    () =>
      generateAiScenePromptsForPipeline({
        workDir,
        youtubeVideoId: downloaded.youtubeVideoId,
        visualStyle: destination.visualStyle!,
        subtitlePath,
        audioPath: downloaded.audioPath,
        language: destination.language,
        detectedNiche: ctx.videoMeta?.detected_niche?.trim() ?? '',
        maxTranscriptSec: options.maxTranscriptSec,
        densityMaxSceneSec: destination.aiSceneDensityMaxSec,
        useReferenceImage,
        sceneImageFlow,
        onLog: toOnLog(log),
        onProgress: log.enabled
          ? progress =>
              log.info(
                `${options.label} scene prompts ${progress.density} chunk ${progress.chunkIndex + 1}/${progress.totalChunks} (attempt ${progress.attempt})...`,
              )
          : undefined,
      }),
    stepTimer,
  );

  log.ok(
    `${options.label} scene prompts saved (${promptResult.scenes.length} scene(s)) → ${promptResult.filePath}`,
  );

  if (useReferenceImage) {
    log.info(`${options.label}: generating scene images (Meta may attach character references per scene)...`);
  }

  log.info(
    `Generating ${options.label} scene images via ${promptsSettingsService.get().defaultSceneImageProvider}...`,
  );

  const renderConfig = await resolveAiRenderConfig(workDir, { kenBurns: isKenBurnsEnabled() });
  const audioSpeed = renderConfig.audioSpeed;
  const settings = appSettingsService.get();
  const kenBurns = settings.kenBurnsOnPrepare && settings.enableKenBurns;
  log.info(
    `${options.label} audio speed locked → ${audioSpeed.toFixed(3)}, kenBurns=${kenBurns ? 'on' : 'off'} (ai-render-config.json)`,
  );
  if (kenBurns) {
    log.info(`${options.label} Ken Burns prebake uses each saved image's own duration (max 4 concurrent)`);
  }

  const aiSlideResult = await timedStep(
    `${options.label} scene images`,
    () =>
      generateAiSceneSlideImages({
        workDir,
        youtubeVideoId: downloaded.youtubeVideoId,
        scenes: promptResult.scenes,
        audioSpeed,
        kenBurns,
        onLog: toOnLog(log),
        onProgress: log.enabled
          ? progress => {
              if (progress.status === 'skipped') {
                log.info(`${options.label} scene image ${progress.sceneName} skipped (already exists)`);
                return;
              }

              const batchLabel =
                progress.batchIndex && progress.totalBatches
                  ? ` batch ${progress.batchIndex}/${progress.totalBatches}`
                  : '';
              log.info(
                `${options.label} scene image ${progress.sceneName} (${progress.sceneIndex}/${progress.totalScenes})${batchLabel}...`,
              );
            }
          : undefined,
      }),
    stepTimer,
  );

  log.ok(
    `${options.label} scene images saved (${aiSlideResult.generatedCount} generated, ${aiSlideResult.skippedCount} skipped, ${aiSlideResult.failedCount} failed) → ${aiSlideResult.slidesDir}`,
  );

  return {
    scenes: aiSlideResult.scenes,
    promptsPath: promptResult.filePath,
    slidesDir: aiSlideResult.slidesDir,
  };
}
