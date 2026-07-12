import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_FLOW_PROJECT_ID } from '../../../../infrastructure/llm-browser/flow.config.js';
import type { FlowToolVisual } from '../../../../infrastructure/llm-browser/llm-browser.types.js';
import { AppError } from '../../../../shared/http/errors.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import { flowBrowserService } from '../../../llm-browser/flow-browser.service.js';
import { metaBrowserService } from '../../../llm-browser/meta-browser.service.js';
import { promptsSettingsService } from '../../../prompts/prompts-settings.service.js';
import { AI_FLOW_TOOL_BATCH_SIZE, AI_SLIDES_DIRNAME } from './ai-video.constants.js';
import type {
  AiVideoScenePrompt,
  GenerateAiSceneSlideImagesInput,
  GenerateAiSceneSlideImagesResult,
} from './ai-video.types.js';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
const META_IMAGE_TIMEOUT_MS = 300_000;
const FLOW_TOOL_TIMEOUT_MS = 300_000;

interface SceneVisualJob {
  index: number;
  name: string;
  prompt: string;
  outputPath: string;
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
  profileId: string,
  slidesDir: string,
  pending: SceneVisualJob[],
  totalScenes: number,
  onProgress?: GenerateAiSceneSlideImagesInput['onProgress'],
): Promise<void> {
  const batches = chunkArray(pending, AI_FLOW_TOOL_BATCH_SIZE);

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

    await flowBrowserService.generateImagesViaTool(profileId, visuals, {
      projectId: DEFAULT_FLOW_PROJECT_ID,
      outputDir: slidesDir,
      timeoutMs: FLOW_TOOL_TIMEOUT_MS,
    });
  }
}

async function generateMetaSceneImages(
  profileId: string,
  slidesDir: string,
  pending: SceneVisualJob[],
  totalScenes: number,
  onProgress?: GenerateAiSceneSlideImagesInput['onProgress'],
): Promise<void> {
  for (const job of pending) {
    onProgress?.({
      sceneIndex: job.index + 1,
      totalScenes,
      sceneName: job.name,
      status: 'generating',
    });

    const response = await metaBrowserService.generateMedia(profileId, job.prompt, {
      mediaKind: 'image',
      outputDir: slidesDir,
      fileName: `${job.name}.jpg`,
      timeoutMs: META_IMAGE_TIMEOUT_MS,
    });

    const savedPath = response.mediaAssets?.find(asset => asset.localPath)?.localPath;
    if (!savedPath || !(await fileExists(savedPath))) {
      throw new AppError(`Meta image generation failed for ${job.name}`, 502, 'AI_SCENE_IMAGE_FAILED');
    }
  }
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
  const profile = chromeProfilesService.requireMainProfile();

  if (pending.length === 0) {
    const imagePaths = await listSlideImagePaths(slidesDir);
    log(`[ai-video] All ${input.scenes.length} scene image(s) already exist → ${slidesDir}`);
    return {
      slidesDir,
      imagePaths,
      generatedCount: 0,
      skippedCount,
    };
  }

  log(
    `[ai-video] Generating ${pending.length} scene image(s) via ${imageProvider} (${skippedCount} skipped) → ${slidesDir}`,
  );
  log(`[ai-video] Mở Chrome main profile ${profile.name} cho scene images...`);

  if (imageProvider === 'flow') {
    await generateFlowSceneImages(profile.id, slidesDir, pending, input.scenes.length, input.onProgress);
  } else {
    await generateMetaSceneImages(profile.id, slidesDir, pending, input.scenes.length, input.onProgress);
  }

  const imagePaths = await listSlideImagePaths(slidesDir);
  const generatedCount = pending.length;

  if (imagePaths.length === 0) {
    throw new AppError('AI scene image generation completed but no images were saved', 502, 'AI_SCENE_IMAGE_EMPTY');
  }

  log(`[ai-video] Scene images saved → ${slidesDir} (${generatedCount} generated, ${skippedCount} skipped)`);

  return {
    slidesDir,
    imagePaths,
    generatedCount,
    skippedCount,
  };
}
