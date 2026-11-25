import fs from 'node:fs/promises';
import path from 'node:path';
import { srtTimestampToMs } from '../../../../infrastructure/subtitle/srt-utils.js';
import { generateVideosFromImagesWithFailover } from '../../../llm-browser/flow/flow-profile-failover.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import { closeChromeProfiles } from '../../../chrome-profiles/chrome-profile.runner.js';
import type { FlowImageToVideoJob } from '../../../llm-browser/flow/flow.types.js';
import { emitDetailLog } from '../video-log.js';
import {
  AI_INTERLEAVED_MAX_IMAGES,
  AI_INTERLEAVED_MIN_IMAGES,
  AI_INTRO_VIDEO_SEC,
  AI_VIDEO_CLIP_SEC,
  AI_VIDEOS_DIRNAME,
} from './ai-video.constants.js';
import { sceneClipJobLengthSec } from './ai-video-clip-span.js';
import { persistAiScenePromptsFile } from './ai-video-scene-prompts-store.js';
import { resolveSceneImageAbsolutePath } from './ai-video-scene-timing.js';
import { isTitleScene } from './ai-video-title-card.js';
import type { AiVideoScenePrompt } from './ai-video.types.js';

export type AiSceneVideoMode = 'full' | 'intro' | 'interleaved';

const MOTION_PROMPT_CONTEXT_CHARS = 400;

export type SceneCameraMotion = 'static' | 'gentle_push_in';

/** Wide framings have room to move in; close/medium framings (big character) would crop it. */
const WIDE_SHOT_RE = /\b(?:wide|extreme long|long|establishing|full[- ]body|aerial|panoramic)\s+shot\b|\bwide angle\b|\bsmall in the (?:frame|distance)\b/i;

/**
 * Camera for a scene clip: the clip is about the character's motion, so the camera stays still
 * unless the image is a wide shot, which may get a very slight push-in.
 */
export function resolveSceneCameraMotion(scenePrompt: string): SceneCameraMotion {
  return WIDE_SHOT_RE.test(scenePrompt) ? 'gentle_push_in' : 'static';
}

const CAMERA_INSTRUCTIONS: Record<SceneCameraMotion, string> = {
  static: 'Camera: locked-off and completely still (no zoom, no pan, no push-in); only the characters and small details move.',
  gentle_push_in:
    'Camera: an extremely subtle, barely noticeable slow drift forward (at most about 2% closer over the whole clip, the framing should look almost unchanged from start to end), no pan, no zoom-in on any character.',
};

/**
 * Flow (Veo) prompt for one scene clip. `motionPrompt` is the scene's own motion, written for it
 * (jp-psy-motion skill); without it every scene gets the same gentle, generic motion.
 */
export function buildSceneMotionPrompt(scenePrompt: string, motionPrompt?: string): string {
  const context = scenePrompt.replace(/\s+/g, ' ').trim().slice(0, MOTION_PROMPT_CONTEXT_CHARS);
  const motion = motionPrompt?.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
  return (
    (motion
      ? `Animate this illustration: ${motion}. Motion stays gentle and natural, as in a calm animated film. `
      : 'Animate this illustration with gentle, natural character motion (expressions, gestures, small body movement). ') +
    `${CAMERA_INSTRUCTIONS[resolveSceneCameraMotion(scenePrompt)]} ` +
    'Keep every character fully inside the frame as in the start frame; never crop heads or bodies. ' +
    'Keep the exact art style, colors and composition of the start frame. ' +
    'No cuts, no text, no new characters, no sudden changes. ' +
    `Scene: ${context}`
  );
}

/**
 * How badly a scene fits one Flow clip: scenes longer than the clip freeze on its last frame
 * (weighted heavier), shorter ones only cut the motion early.
 */
function clipFitCost(durationSec: number): number {
  return durationSec > AI_VIDEO_CLIP_SEC ? (durationSec - AI_VIDEO_CLIP_SEC) * 3 : AI_VIDEO_CLIP_SEC - durationSec;
}

/**
 * Interleaved pick over eligible scenes (in order): every intro scene, then one clip after each
 * run of `minImages`–`maxImages` image scenes, choosing the candidate whose length fits a clip best.
 */
export function selectInterleavedScenes<T>(
  eligible: T[],
  startSec: (scene: T) => number,
  durationSec: (scene: T) => number,
  introSec: number = AI_INTRO_VIDEO_SEC,
  minImages: number = AI_INTERLEAVED_MIN_IMAGES,
  maxImages: number = AI_INTERLEAVED_MAX_IMAGES,
): T[] {
  const picked: T[] = [];
  let cursor = 0;
  while (cursor < eligible.length && startSec(eligible[cursor]!) < introSec) {
    picked.push(eligible[cursor]!);
    cursor += 1;
  }
  for (;;) {
    const first = cursor + minImages;
    if (first >= eligible.length) break;
    const last = Math.min(cursor + maxImages, eligible.length - 1);
    let best = first;
    for (let i = first + 1; i <= last; i += 1) {
      if (clipFitCost(durationSec(eligible[i]!)) < clipFitCost(durationSec(eligible[best]!))) best = i;
    }
    picked.push(eligible[best]!);
    cursor = best + 1;
  }
  return picked;
}

/** Scenes that should become video clips for the given mode (only scenes that already have an image; never title cards). */
export function selectScenesForVideo(
  scenes: AiVideoScenePrompt[],
  mode: AiSceneVideoMode,
  introSec: number = AI_INTRO_VIDEO_SEC,
): number[] {
  const eligible: number[] = [];
  scenes.forEach((scene, index) => {
    if (!scene.path?.trim() || isTitleScene(scene)) return;
    if (mode === 'intro' && srtTimestampToMs(scene.startTime) >= introSec * 1_000) return;
    eligible.push(index);
  });
  if (mode !== 'interleaved') return eligible;
  const startSec = (index: number) => srtTimestampToMs(scenes[index]!.startTime) / 1_000;
  return selectInterleavedScenes(
    eligible,
    startSec,
    index => (srtTimestampToMs(scenes[index]!.endTime) - srtTimestampToMs(scenes[index]!.startTime)) / 1_000,
    introSec,
  );
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
    prompt: buildSceneMotionPrompt(input.scenes[index]!.prompt, input.scenes[index]!.motionPrompt),
    lengthSec: sceneClipJobLengthSec(input.workDir, input.scenes, index),
  }));

  log(`[ai-video] Generating ${jobs.length} video clip(s) via Flow (mode=${input.mode}) → ${videosDir}`);

  const mains = chromeProfilesService.listProfilesForLlm('video', 'flow');
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
