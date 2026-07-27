import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import type { FlowToolVisual } from '../../../../infrastructure/llm-browser/llm-browser.types.js';
import {
  connectPlaywrightToGpmProfile,
  disconnectGpmPlaywright,
  type GpmPlaywrightConnection,
} from '../../../../infrastructure/gpm/gpm-playwright.connector.js';
import type { GpmProfile } from '../../../../infrastructure/gpm/gpm-api.client.js';
import { AppError } from '../../../../shared/http/errors.js';
import {
  closeChromeProfiles,
  createChromeProfilePage,
  openChromeProfile,
} from '../../../chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../../../chrome-profiles/chrome-profiles.types.js';
import { gpmManagerService } from '../../../gpm-manager/gpm-manager.service.js';
import { generateImagesViaToolWithFailover } from '../../../llm-browser/flow-profile-failover.js';
import { metaBrowserService } from '../../../llm-browser/meta-browser.service.js';
import { promptsSettingsService } from '../../../prompts/prompts-settings.service.js';
import { resolveCharacterReferenceImagePaths } from './ai-video-character-references.js';
import { AI_FLOW_TOOL_BATCH_SIZE, AI_SLIDES_DIRNAME } from './ai-video.constants.js';
import { persistAiScenePromptsFile } from './ai-video-scene-prompts-store.js';
import {
  attachSceneImagePaths,
  redistributeMissingSceneTimes,
  scenesWithImagePaths,
} from './ai-video-scene-timing.js';
import type {
  AiVideoScenePrompt,
  GenerateAiSceneSlideImagesInput,
  GenerateAiSceneSlideImagesResult,
} from './ai-video.types.js';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
const META_IMAGE_TIMEOUT_MS = 300_000;
const META_IMAGE_TABS_PER_MAIN_PROFILE = 5;
const META_IMAGE_MAX_RETRIES = 3;
const FLOW_TOOL_TIMEOUT_MS = 300_000;

interface SceneVisualJob {
  index: number;
  name: string;
  prompt: string;
  outputPath: string;
  referenceIds?: string[];
}

interface MetaImageWorker {
  workerIndex: number;
  label: string;
  page: Page;
  kind: 'chrome' | 'gpm';
  profileId: string;
}

interface MetaWorkerPool {
  workers: MetaImageWorker[];
  gpmConnections: GpmPlaywrightConnection[];
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

async function generateFlowSceneImages(
  slidesDir: string,
  pending: SceneVisualJob[],
  totalScenes: number,
  log: (msg: string) => void,
  onProgress?: GenerateAiSceneSlideImagesInput['onProgress'],
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
      } else {
        failedCount += 1;
      }
    }
  }

  return { generatedCount, failedCount };
}

async function openChromeMetaWorkers(
  tabProfiles: ChromeProfile[],
  startIndex: number,
  log: (msg: string) => void,
): Promise<MetaImageWorker[]> {
  if (tabProfiles.length === 0) return [];

  const uniqueProfiles = [...new Map(tabProfiles.map(profile => [profile.id, profile])).values()];
  for (const profile of uniqueProfiles) {
    log(`[ai-video] Mở Chrome main profile ${profile.name} cho Meta scene images...`);
    await openChromeProfile(profile.id, profile.userDataDir);
  }

  const workers: MetaImageWorker[] = [];
  for (const profile of tabProfiles) {
    try {
      const page = await createChromeProfilePage(profile.id);
      await metaBrowserService.openOnPage(page);
      const workerIndex = startIndex + workers.length;
      workers.push({
        workerIndex,
        label: `chrome:${profile.name}`,
        page,
        kind: 'chrome',
        profileId: profile.id,
      });
      log(`[ai-video] Meta worker ${workerIndex + 1} sẵn sàng trên Chrome ${profile.name}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log(`[ai-video] Bỏ qua Chrome tab trên ${profile.name}: ${reason}`);
    }
  }

  return workers;
}

function allocateChromeMetaTabProfiles(
  profiles: ChromeProfile[],
  pendingCount: number,
): ChromeProfile[] {
  const tabProfiles: ChromeProfile[] = [];

  for (const profile of profiles) {
    const remaining = pendingCount - tabProfiles.length;
    if (remaining <= 0) break;

    const tabCount = Math.min(META_IMAGE_TABS_PER_MAIN_PROFILE, remaining);
    for (let tabIndex = 0; tabIndex < tabCount; tabIndex += 1) {
      tabProfiles.push(profile);
    }
  }

  return tabProfiles;
}

async function openGpmMetaWorkers(
  profiles: GpmProfile[],
  startIndex: number,
  log: (msg: string) => void,
): Promise<{ workers: MetaImageWorker[]; connections: GpmPlaywrightConnection[] }> {
  if (profiles.length === 0) return { workers: [], connections: [] };

  const results = await Promise.all(
    profiles.map(async profile => {
      try {
        log(`[ai-video] Start GPM profile ${profile.name} cho Meta scene images...`);
        const connection = await connectPlaywrightToGpmProfile(profile.id);
        await metaBrowserService.openOnPage(connection.page);
        return { profile, connection, error: null as string | null };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        log(`[ai-video] Bỏ qua GPM profile ${profile.name}: ${reason}`);
        return { profile, connection: null, error: reason };
      }
    }),
  );

  const workers: MetaImageWorker[] = [];
  const connections: GpmPlaywrightConnection[] = [];

  for (const result of results) {
    if (!result.connection) continue;
    const workerIndex = startIndex + workers.length;
    workers.push({
      workerIndex,
      label: `gpm:${result.profile.name}`,
      page: result.connection.page,
      kind: 'gpm',
      profileId: result.connection.profileId,
    });
    connections.push(result.connection);
    log(`[ai-video] Meta worker ${workerIndex + 1} sẵn sàng trên GPM ${result.profile.name}`);
  }

  return { workers, connections };
}

async function openMetaWorkerPool(
  pendingCount: number,
  log: (msg: string) => void,
): Promise<MetaWorkerPool> {
  const mains = chromeProfilesService.listMainProfiles();
  const chromeTabProfiles = allocateChromeMetaTabProfiles(mains, pendingCount);
  const remainingAfterChrome = Math.max(0, pendingCount - chromeTabProfiles.length);

  let gpmCandidates: GpmProfile[] = [];
  if (remainingAfterChrome > 0) {
    try {
      gpmCandidates = await gpmManagerService.listMetaEnabledProfiles();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const code = err instanceof AppError ? err.code : undefined;
      log(
        `[ai-video] GPM meta profiles unavailable (${code ?? 'error'}): ${reason} — tiếp tục Chrome-only`,
      );
      gpmCandidates = [];
    }
  }
  const gpmProfiles = gpmCandidates.slice(0, remainingAfterChrome);

  log(
    `[ai-video] Meta capacity: pending=${pendingCount}, chromeMains=${mains.length}, ` +
      `tabsPerMain=${META_IMAGE_TABS_PER_MAIN_PROFILE}, chromeTabs=${chromeTabProfiles.length}, ` +
      `gpmMeta=${gpmProfiles.length}` +
      (gpmProfiles.length > 0
        ? ` (${gpmProfiles.map(profile => profile.name).join(', ')})`
        : ''),
  );

  if (chromeTabProfiles.length === 0 && gpmProfiles.length === 0) {
    throw new AppError(
      'No Chrome main or GPM meta-enabled profiles available for Meta scene images',
      400,
      'AI_SCENE_IMAGE_NO_META_PROFILES',
    );
  }

  const chromeWorkers = await openChromeMetaWorkers(chromeTabProfiles, 0, log);
  const { workers: gpmWorkers, connections } = await openGpmMetaWorkers(
    gpmProfiles,
    chromeWorkers.length,
    log,
  );

  const workers = [...chromeWorkers, ...gpmWorkers];
  if (workers.length === 0) {
    for (const connection of connections) {
      await disconnectGpmPlaywright(connection).catch(() => undefined);
    }
    throw new AppError(
      'Failed to open any Meta workers (Chrome/GPM)',
      502,
      'AI_SCENE_IMAGE_NO_META_WORKERS',
    );
  }

  return { workers, gpmConnections: connections };
}

async function cleanupMetaWorkerPool(pool: MetaWorkerPool, log: (msg: string) => void): Promise<void> {
  await Promise.all(
    pool.gpmConnections.map(async connection => {
      try {
        await disconnectGpmPlaywright(connection);
        log(`[ai-video] Closed GPM profile ${connection.profileId}`);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        log(`[ai-video] Failed to close GPM ${connection.profileId}: ${reason}`);
      }
    }),
  );

  const chromeProfileIds = [
    ...new Set(pool.workers.filter(worker => worker.kind === 'chrome').map(worker => worker.profileId)),
  ];

  if (chromeProfileIds.length === 0) return;

  const closedIds = await closeChromeProfiles(chromeProfileIds);
  for (const profileId of closedIds) {
    log(`[ai-video] Closed Chrome profile ${profileId} after scene images`);
  }
}

async function generateMetaSceneImages(
  workDir: string,
  slidesDir: string,
  pending: SceneVisualJob[],
  totalScenes: number,
  log: (msg: string) => void,
  onProgress?: GenerateAiSceneSlideImagesInput['onProgress'],
): Promise<{ generatedCount: number; failedCount: number }> {
  const pool = await openMetaWorkerPool(pending.length, log);
  const { workers } = pool;
  let nextJobIndex = 0;
  let generatedCount = 0;
  let failedCount = 0;

  log(
    `[ai-video] Meta parallel: ${workers.length} worker(s) ` +
      `[${workers.map(worker => worker.label).join(', ')}] cho ${pending.length} scene(s)`,
  );

  async function runWorker(worker: MetaImageWorker): Promise<void> {
    while (true) {
      const jobIndex = nextJobIndex;
      nextJobIndex += 1;
      if (jobIndex >= pending.length) return;

      const job = pending[jobIndex];
      onProgress?.({
        sceneIndex: job.index + 1,
        totalScenes,
        sceneName: job.name,
        status: 'generating',
      });

      log(
        `[ai-video] worker ${worker.workerIndex + 1}/${workers.length} (${worker.label}) → ${job.name}`,
      );

      let succeeded = false;
      for (let attempt = 1; attempt <= META_IMAGE_MAX_RETRIES; attempt += 1) {
        try {
          const referenceImagePaths = await resolveCharacterReferenceImagePaths(
            workDir,
            job.referenceIds ?? [],
            log,
          );
          if ((job.referenceIds?.length ?? 0) > 0 && referenceImagePaths.length === 0) {
            log(
              `[ai-video] ${job.name}: no reference images resolved — continuing with prompt only`,
            );
          }

          const response = await metaBrowserService.generateMediaOnPage(worker.page, job.prompt, {
            mediaKind: 'image',
            outputDir: slidesDir,
            fileName: `${job.name}.jpg`,
            timeoutMs: META_IMAGE_TIMEOUT_MS,
            ...(referenceImagePaths.length > 0 ? { referenceImagePaths } : {}),
          });

          const savedPath = response.mediaAssets?.find(asset => asset.localPath)?.localPath;
          if (!savedPath || !(await fileExists(savedPath))) {
            throw new AppError(`Meta image generation failed for ${job.name}`, 502, 'AI_SCENE_IMAGE_FAILED');
          }

          generatedCount += 1;
          succeeded = true;
          break;
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          if (attempt === META_IMAGE_MAX_RETRIES) {
            log(
              `[ai-video] bỏ qua ${job.name} sau ${META_IMAGE_MAX_RETRIES} lần: ${reason}`,
            );
            failedCount += 1;
          } else {
            log(
              `[ai-video] ${job.name} attempt ${attempt}/${META_IMAGE_MAX_RETRIES} failed → retry (${reason})`,
            );
          }
        }
      }

      if (!succeeded) {
        onProgress?.({
          sceneIndex: job.index + 1,
          totalScenes,
          sceneName: job.name,
          status: 'skipped',
        });
      }
    }
  }

  try {
    await Promise.all(workers.map(worker => runWorker(worker)));
    return { generatedCount, failedCount };
  } finally {
    await cleanupMetaWorkerPool(pool, log);
  }
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

  for (const job of jobs) {
    if (!(await fileExists(job.outputPath))) continue;
    input.onProgress?.({
      sceneIndex: job.index + 1,
      totalScenes: input.scenes.length,
      sceneName: job.name,
      status: 'skipped',
    });
  }

  const imageProvider = promptsSettingsService.get().defaultImageProvider;

  if (pending.length === 0) {
    const imagePaths = await listSlideImagePaths(slidesDir);
    log(`[ai-video] All ${input.scenes.length} scene image(s) already exist → ${slidesDir}`);
    const scenes = await finalizeScenesWithPaths(
      input.workDir,
      input.youtubeVideoId,
      input.scenes,
      log,
    );
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
    `[ai-video] Generating ${pending.length} scene image(s) via ${imageProvider} (${skippedCount} skipped) → ${slidesDir}`,
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

  return {
    slidesDir,
    imagePaths,
    scenes,
    generatedCount,
    skippedCount,
    failedCount,
  };
}
