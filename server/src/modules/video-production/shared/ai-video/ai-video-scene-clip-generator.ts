import fs from 'node:fs/promises';
import path from 'node:path';
import { srtTimestampToMs } from '../../../../infrastructure/subtitle/srt-utils.js';
import { generateVideosFromImagesWithFailover } from '../../../llm-browser/flow/flow-profile-failover.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import { closeChromeProfiles } from '../../../chrome-profiles/chrome-profile.runner.js';
import type { FlowImageToVideoJob } from '../../../llm-browser/flow/flow.types.js';
import { emitDetailLog } from '../video-log.js';
import { AI_INTRO_VIDEO_SEC, AI_VIDEOS_DIRNAME } from './ai-video.constants.js';
import { persistAiScenePromptsFile } from './ai-video-scene-prompts-store.js';
import { resolveSceneImageAbsolutePath } from './ai-video-scene-timing.js';
import { isTitleScene } from './ai-video-title-card.js';
import type { AiVideoScenePrompt } from './ai-video.types.js';

export type AiSceneVideoMode = 'full' | 'intro';

const MOTION_PROMPT_CONTEXT_CHARS = 400;

export function buildSceneMotionPrompt(scenePrompt: string): string {
  const context = scenePrompt.replace(/\s+/g, ' ').trim().slice(0, MOTION_PROMPT_CONTEXT_CHARS);
  return (
    'Animate this illustration with gentle, natural motion: subtle character movement and a slow camera push-in. ' +
    'Keep the exact art style, colors and composition of the start frame. ' +
    'No cuts, no text, no new characters, no sudden changes. ' +
    `Scene: ${context}`
  );
}

/** Scenes that should become video clips for the given mode (only scenes that already have an image; never title cards). */
export function selectScenesForVideo(
  scenes: AiVideoScenePrompt[],
  mode: AiSceneVideoMode,
  introSec: number = AI_INTRO_VIDEO_SEC,
): number[] {
  const indexes: number[] = [];
  scenes.forEach((scene, index) => {
    if (!scene.path?.trim() || isTitleScene(scene)) return;
    if (mode === 'intro' && srtTimestampToMs(scene.startTime) >= introSec * 1_000) return;
    indexes.push(index);
  });
  return indexes;
}

function sceneVideoName(index: number): string {
  return `scene-${String(index + 1).padStart(3, '0')}`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export interface GenerateAiSceneVideoClipsInput {
  workDir: string;
  youtubeVideoId: string;
  /** Scenes after image generation (each has `path` when its image exists). */
  scenes: AiVideoScenePrompt[];
  mode: AiSceneVideoMode;
  onLog?: (msg: string) => void;
}

export interface GenerateAiSceneVideoClipsResult {
  scenes: AiVideoScenePrompt[];
  requestedCount: number;
  generatedCount: number;
  failedCount: number;
}

/**
 * Turn scene images into Flow video clips. Scenes whose clip could not be made keep
 * their image, so the assembler falls back to Ken Burns for them.
 */
export async function generateAiSceneVideoClips(
  input: GenerateAiSceneVideoClipsInput,
): Promise<GenerateAiSceneVideoClipsResult> {
  const log = (msg: string) => emitDetailLog(msg, input.onLog);
  const videosDir = path.join(input.workDir, AI_VIDEOS_DIRNAME);
  const indexes = selectScenesForVideo(input.scenes, input.mode);

  if (indexes.length === 0) {
    log(`[ai-video] No scene eligible for video (mode=${input.mode})`);
    return { scenes: input.scenes, requestedCount: 0, generatedCount: 0, failedCount: 0 };
  }

  const jobs: FlowImageToVideoJob[] = indexes.map(index => ({
    name: sceneVideoName(index),
    imagePath: resolveSceneImageAbsolutePath(input.workDir, input.scenes[index]!),
    prompt: buildSceneMotionPrompt(input.scenes[index]!.prompt),
  }));

  log(`[ai-video] Generating ${jobs.length} video clip(s) via Flow (mode=${input.mode}) → ${videosDir}`);

  const mains = chromeProfilesService.listMainProfiles();
  try {
    const result = await generateVideosFromImagesWithFailover(jobs, { outputDir: videosDir }, {
      onProfileSwitch: (from, to, remaining) =>
        log(`[ai-video] Flow quota exhausted on ${from.name}, switching to ${to.name} (${remaining} video(s) remaining)`),
    });
    for (const failure of result.failed) {
      log(`[ai-video] ${failure.name}: no video, keeping image — ${failure.reason}`);
    }
  } finally {
    await closeChromeProfiles(mains.map(profile => profile.id));
  }

  const scenes: AiVideoScenePrompt[] = [];
  let generatedCount = 0;
  for (const [index, scene] of input.scenes.entries()) {
    const relativePath = path.posix.join(AI_VIDEOS_DIRNAME, `${sceneVideoName(index)}.mp4`);
    if (indexes.includes(index) && (await fileExists(path.join(input.workDir, relativePath)))) {
      scenes.push({ ...scene, videoPath: relativePath });
      generatedCount += 1;
    } else {
      const { videoPath: _removed, ...rest } = scene;
      scenes.push(rest);
    }
  }

  const filePath = await persistAiScenePromptsFile(input.workDir, input.youtubeVideoId, scenes);
  log(`[ai-video] Video clips: ${generatedCount}/${jobs.length} ready → ${filePath}`);
  return {
    scenes,
    requestedCount: jobs.length,
    generatedCount,
    failedCount: jobs.length - generatedCount,
  };
}
