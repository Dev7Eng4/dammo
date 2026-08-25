import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  FlowToolVisual,
  MetaConcurrencyMode,
  MetaMediaBatchJob,
} from '../../../../infrastructure/llm-browser/llm-browser.types.js';
import { AppError } from '../../../../shared/http/errors.js';
import { closeChromeProfiles } from '../../../chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import { generateImagesViaToolWithFailover } from '../../../llm-browser/flow-profile-failover.js';
import { metaBrowserService } from '../../../llm-browser/meta-browser.service.js';
import { promptsSettingsService } from '../../../prompts/prompts-settings.service.js';
import { SS_ENABLE_KEN_BURNS } from '../slideshow/slideshow.constants.js';
import type { SlideSpec } from '../slideshow/slideshow.types.js';
import { resolveCharacterReferenceImagePaths } from './ai-video-character-references.js';
import { AiClipPrebakePool } from './ai-video-clip-prebake.js';
import { AI_FLOW_TOOL_BATCH_SIZE, AI_SLIDES_DIRNAME } from './ai-video.constants.js';
import { persistAiScenePromptsFile } from './ai-video-scene-prompts-store.js';
import { buildFinalAiSlides } from './ai-video-slide-spec.js';
import {
  attachSceneImagePaths,
  redistributeMissingSceneTimes,
  scenesWithImagePaths,
} from './ai-video-scene-timing.js';
import type {
  AiVideoScenePrompt,
  GenerateAiSceneSlideImagesInput,
  GenerateAiSceneSlideImagesResult,
  MetaImageConcurrencyMode,
} from './ai-video.types.js';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
const FLOW_TOOL_TIMEOUT_MS = 300_000;

interface SceneVisualJob {
  index: number;
  name: string;
  prompt: string;
  outputPath: string;
  referenceIds?: string[];
}

function buildSceneName(index: number): string {
  return `scene-${String(index + 1).padStart(3, '0')}`;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listSlideImagePaths(slidesDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(slidesDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map(entry => path.join(slidesDir, entry.name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  } catch {
    return [];
  }
}

function buildSceneVisualJobs(scenes: AiVideoScenePrompt[], slidesDir: string): SceneVisualJob[] {
  return scenes.map((scene, index) => {
    const name = buildSceneName(index);
    return {
      index,
      name,
      prompt: scene.prompt.trim(),
      outputPath: path.join(slidesDir, `${name}.jpg`),
      ...(scene.references?.length ? { referenceIds: scene.references } : {}),
    };
  });
}

async function resolvePendingJobs(jobs: SceneVisualJob[]): Promise<{
  pending: SceneVisualJob[];
  skippedCount: number;
}> {
  const pending: SceneVisualJob[] = [];
  let skippedCount = 0;

  for (const job of jobs) {
    if (await fileExists(job.outputPath)) {
      skippedCount += 1;
      continue;
    }
    if (!job.prompt) {
      throw new AppError(`Scene ${job.name} has an empty prompt`, 400, 'AI_SCENE_IMAGE_EMPTY_PROMPT');
    }
    pending.push(job);
  }

  return { pending, skippedCount };
}

function createPrebakeEnqueue(
  assumedSlidesByName: ReadonlyMap<string, SlideSpec> | undefined,
  pool: AiClipPrebakePool | null,
): (jobName: string) => void {
  if (!pool || !assumedSlidesByName) {
    return () => undefined;
  }

  const enqueued = new Set<string>();

  return (jobName: string) => {
    if (enqueued.has(jobName)) return;
    const slide = assumedSlidesByName.get(jobName);
    if (!slide) return;

    enqueued.add(jobName);
    pool.enqueueProvisionalSlide(slide);
  };
}

function clipPrebakeEnabled(input: GenerateAiSceneSlideImagesInput): boolean {
  return (
    SS_ENABLE_KEN_BURNS &&
    input.audioSpeed != null &&
    input.assumedFinalSlidesByName != null &&
    input.assumedFinalSlidesByName.size > 0
  );
}

async function finalizeScenesWithPaths(
  workDir: string,
  youtubeVideoId: string,
  scenes: AiVideoScenePrompt[],
  log: (msg: string) => void,
): Promise<AiVideoScenePrompt[]> {
  const withPaths = await attachSceneImagePaths(scenes, workDir);
  const redistributed = redistributeMissingSceneTimes(withPaths);
  const filePath = await persistAiScenePromptsFile(workDir, youtubeVideoId, redistributed);
  const withImage = scenesWithImagePaths(redistributed).length;
  const missing = redistributed.length - withImage;
  log(
    `[ai-video] Scene prompts updated → ${filePath} (${withImage} with path, ${missing} missing)`,
  );
  return redistributed;
}

async function reconcileClipPrebake(
  input: GenerateAiSceneSlideImagesInput,
  scenes: AiVideoScenePrompt[],
  pool: AiClipPrebakePool | null,
  log: (msg: string) => void,
): Promise<void> {
  if (!pool || input.audioSpeed == null || !input.audioPath) return;

  await pool.drain();
  const finalSlides = await buildFinalAiSlides(
    input.workDir,
    scenes,
    input.audioSpeed,
    input.audioPath,
    log,
  );
  await pool.reconcileFinalSlides(finalSlides);
}

async function generateFlowSceneImages(
  slidesDir: string,
  pending: SceneVisualJob[],
  totalScenes: number,
  log: (msg: string) => void,
  onProgress?: GenerateAiSceneSlideImagesInput['onProgress'],
  onImageSaved?: (jobName: string) => void,
): Promise<{ generatedCount: number; failedCount: number }> {
  const batches = chunkArray(pending, AI_FLOW_TOOL_BATCH_SIZE);
  let generatedCount = 0;
  let failedCount = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    const visuals: FlowToolVisual[] = batch.map(job => ({
      name: job.name,
      prompt: job.prompt,
    }));

    for (const job of batch) {
      onProgress?.({
        sceneIndex: job.index + 1,
        totalScenes,
        batchIndex: batchIndex + 1,
        totalBatches: batches.length,
        sceneName: job.name,
        status: 'generating',
      });
    }

    try {
      await generateImagesViaToolWithFailover(visuals, {
        outputDir: slidesDir,
        timeoutMs: FLOW_TOOL_TIMEOUT_MS,
        onImageSaved: saved => {
          onImageSaved?.(saved.name);
        },
      }, {
        onProfileSwitch: (from, to, remainingCount) => {
          log(
            `[ai-video] Flow quota exhausted on ${from.name}, switching to ${to.name} ` +
              `(${remainingCount} image(s) remaining)`,
          );
        },
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log(`[ai-video] Flow batch ${batchIndex + 1}/${batches.length} failed: ${reason}`);
    }

    for (const job of batch) {
      if (await fileExists(job.outputPath)) {
        generatedCount += 1;
        onImageSaved?.(job.name);
      } else {
        failedCount += 1;
      }
    }
  }

  return { generatedCount, failedCount };
}

async function generateMetaSceneImages(
  workDir: string,
  slidesDir: string,
  pending: SceneVisualJob[],
  totalScenes: number,
  log: (msg: string) => void,
  onProgress: GenerateAiSceneSlideImagesInput['onProgress'] | undefined,
  mode: MetaConcurrencyMode,
  onImageSaved?: (jobName: string) => void,
): Promise<{ generatedCount: number; failedCount: number }> {
  const jobs: MetaMediaBatchJob[] = [];

  for (const job of pending) {
    const referenceImagePaths = await resolveCharacterReferenceImagePaths(
      workDir,
      job.referenceIds ?? [],
      log,
    );
    if ((job.referenceIds?.length ?? 0) > 0 && referenceImagePaths.length === 0) {
      log(`[ai-video] ${job.name}: no reference images resolved — continuing with prompt only`);
    }

    jobs.push({
      id: job.name,
      prompt: job.prompt,
      outputDir: slidesDir,
      fileName: `${job.name}.jpg`,
      mediaKind: 'image',
      ...(referenceImagePaths.length > 0 ? { referenceImagePaths } : {}),
    });
  }

  const result = await metaBrowserService.generateMediaBatch(jobs, {
    concurrency: mode,
    onLog: log,
    onJobProgress: progress => {
      const pendingJob = pending.find(job => job.name === progress.jobId);
      if (!pendingJob) return;
      if (progress.status === 'generating') {
        onProgress?.({
          sceneIndex: pendingJob.index + 1,
          totalScenes,
          sceneName: pendingJob.name,
          status: 'generating',
        });
        return;
      }
      if (progress.status === 'done') {
        onImageSaved?.(pendingJob.name);
        return;
      }
      if (progress.status === 'failed') {
        onProgress?.({
          sceneIndex: pendingJob.index + 1,
          totalScenes,
          sceneName: pendingJob.name,
          status: 'skipped',
        });
      }
    },
  });

  return {
    generatedCount: result.generatedCount,
    failedCount: result.failedCount,
  };
}

export async function generateAiSceneSlideImages(
  input: GenerateAiSceneSlideImagesInput,
): Promise<GenerateAiSceneSlideImagesResult> {
  const log = (msg: string) => {
    console.log(msg);
    input.onLog?.(msg);
  };

  if (input.scenes.length === 0) {
    throw new AppError('No AI scenes available for image generation', 400, 'AI_SCENE_IMAGE_NO_SCENES');
  }

  const slidesDir = path.join(input.workDir, AI_SLIDES_DIRNAME);
  await fs.mkdir(slidesDir, { recursive: true });

  const jobs = buildSceneVisualJobs(input.scenes, slidesDir);
  const { pending, skippedCount } = await resolvePendingJobs(jobs);

  const kenBurnsPrebake = clipPrebakeEnabled(input);
  const prebakePool = kenBurnsPrebake
    ? new AiClipPrebakePool(input.workDir, { onLog: log })
    : null;
  const enqueuePrebake = kenBurnsPrebake
    ? createPrebakeEnqueue(input.assumedFinalSlidesByName, prebakePool)
    : () => undefined;

  for (const job of jobs) {
    if (!(await fileExists(job.outputPath))) continue;
    input.onProgress?.({
      sceneIndex: job.index + 1,
      totalScenes: input.scenes.length,
      sceneName: job.name,
      status: 'skipped',
    });
    enqueuePrebake(job.name);
  }

  const imageProvider = promptsSettingsService.get().defaultImageProvider;
  const metaConcurrency: MetaImageConcurrencyMode = input.metaConcurrency ?? 'batch';

  if (pending.length === 0) {
    const imagePaths = await listSlideImagePaths(slidesDir);
    log(`[ai-video] All ${input.scenes.length} scene image(s) already exist → ${slidesDir}`);
    const scenes = await finalizeScenesWithPaths(
      input.workDir,
      input.youtubeVideoId,
      input.scenes,
      log,
    );
    await reconcileClipPrebake(input, scenes, prebakePool, log);
    return {
      slidesDir,
      imagePaths,
      scenes,
      generatedCount: 0,
      skippedCount,
      failedCount: 0,
    };
  }

  log(
    `[ai-video] Generating ${pending.length} scene image(s) via ${imageProvider}` +
      (imageProvider === 'meta' ? ` mode=${metaConcurrency}` : '') +
      ` (${skippedCount} skipped) → ${slidesDir}` +
      (kenBurnsPrebake ? ' (Ken Burns prebake on save, max 4 concurrent)' : ''),
  );

  let generatedCount = 0;
  let failedCount = 0;

  if (imageProvider === 'flow') {
    const mains = chromeProfilesService.listMainProfiles();
    log(
      `[ai-video] Flow scene images via main profile(s): ${mains.map(p => p.name).join(', ')}`,
    );
    try {
      const flowResult = await generateFlowSceneImages(
        slidesDir,
        pending,
        input.scenes.length,
        log,
        input.onProgress,
        enqueuePrebake,
      );
      generatedCount = flowResult.generatedCount;
      failedCount = flowResult.failedCount;
    } finally {
      const closedIds = await closeChromeProfiles(mains.map(profile => profile.id));
      for (const profileId of closedIds) {
        const name = mains.find(profile => profile.id === profileId)?.name ?? profileId;
        log(`[ai-video] Closed Chrome profile ${name} after scene images`);
      }
    }
  } else {
    const metaResult = await generateMetaSceneImages(
      input.workDir,
      slidesDir,
      pending,
      input.scenes.length,
      log,
      input.onProgress,
      metaConcurrency,
      enqueuePrebake,
    );
    generatedCount = metaResult.generatedCount;
    failedCount = metaResult.failedCount;
  }

  const imagePaths = await listSlideImagePaths(slidesDir);

  if (imagePaths.length === 0) {
    throw new AppError('AI scene image generation completed but no images were saved', 502, 'AI_SCENE_IMAGE_EMPTY');
  }

  log(
    `[ai-video] Scene images saved → ${slidesDir} ` +
      `(${generatedCount} generated, ${skippedCount} skipped, ${failedCount} failed)`,
  );

  const scenes = await finalizeScenesWithPaths(
    input.workDir,
    input.youtubeVideoId,
    input.scenes,
    log,
  );

  await reconcileClipPrebake(input, scenes, prebakePool, log);

  return {
    slidesDir,
    imagePaths,
    scenes,
    generatedCount,
    skippedCount,
    failedCount,
  };
}
