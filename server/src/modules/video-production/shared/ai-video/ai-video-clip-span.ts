import fs from 'node:fs';
import path from 'node:path';
import { srtTimestampToMs } from '../../../../infrastructure/subtitle/srt-utils.js';
import { AI_RENDER_CONFIG_FILENAME } from './ai-render-config.js';
import { FLOW_CLIP_MAX_SEC, FLOW_CLIP_MIN_SEC } from './ai-video.constants.js';
import type { AiVideoScenePrompt } from './ai-video.types.js';

/** Scenes a scene's clip covers, itself included, cut at the end of the list. */
export function clipSpanOf(scenes: AiVideoScenePrompt[], index: number): number {
  const span = Number(scenes[index]?.clipSpan);
  const wanted = Number.isInteger(span) && span > 1 ? span : 1;
  return Math.max(1, Math.min(wanted, scenes.length - index));
}

/**
 * Seconds the scene's clip is on screen: from its start to the start of the first scene after its span
 * (the app holds each picture until the next one starts), divided by the render's audio speed.
 */
export function sceneClipWindowSec(scenes: AiVideoScenePrompt[], index: number, audioSpeed = 1): number {
  const scene = scenes[index];
  if (!scene) return 0;
  const after = scenes[index + clipSpanOf(scenes, index)];
  const last = scenes[index + clipSpanOf(scenes, index) - 1]!;
  const endMs = after ? srtTimestampToMs(after.startTime) : srtTimestampToMs(last.endTime);
  return Math.max(0, endMs - srtTimestampToMs(scene.startTime)) / 1_000 / (audioSpeed > 0 ? audioSpeed : 1);
}

/**
 * Clip length (Flow and Muse) for a clip filling `windowSec`: always rounded up to whole seconds
 * (4.25 s → 5 s), so the clip never runs out before the scene ends; assembly cuts the extra.
 * Only float noise under 10 ms is ignored (5.004 s stays 5 s). Clamped to the 3–10 s both tools allow.
 */
export function sceneClipLengthSec(windowSec: number): number {
  return Math.max(FLOW_CLIP_MIN_SEC, Math.min(FLOW_CLIP_MAX_SEC, Math.ceil(windowSec - 0.01)));
}

/** Audio speed the video is rendered at (ai-render-config.json); 1 before the first render. */
export function readClipAudioSpeed(workDir: string): number {
  try {
    const speed = Number(JSON.parse(fs.readFileSync(path.join(workDir, AI_RENDER_CONFIG_FILENAME), 'utf8'))?.audioSpeed);
    return Number.isFinite(speed) && speed > 0 ? speed : 1;
  } catch {
    return 1;
  }
}

/** Flow Length for the clip of `scenes[index]` in the video at `workDir`. */
export function sceneClipJobLengthSec(workDir: string, scenes: AiVideoScenePrompt[], index: number): number {
  return sceneClipLengthSec(sceneClipWindowSec(scenes, index, readClipAudioSpeed(workDir)));
}

/**
 * Scenes as the slideshow should place them: a scene whose clip exists and covers later scenes
 * (`clipSpan`) runs until the end of its span, and the covered scenes lose their image so the clip
 * stays on screen over their time. Without the clip file nothing changes, so a failed or removed
 * clip falls back to the separate images.
 */
export function applyClipSpans(workDir: string, scenes: AiVideoScenePrompt[]): AiVideoScenePrompt[] {
  const placed = scenes.map(scene => ({ ...scene }));
  for (let index = 0; index < placed.length; index += 1) {
    const span = clipSpanOf(placed, index);
    const clip = placed[index]!.videoPath?.trim();
    if (span <= 1 || !clip) continue;
    if (!fs.existsSync(path.isAbsolute(clip) ? clip : path.join(workDir, clip))) continue;
    const last = index + span - 1;
    placed[index]!.endTime = placed[last]!.endTime;
    for (let covered = index + 1; covered <= last; covered += 1) {
      delete placed[covered]!.path;
      delete placed[covered]!.videoPath;
    }
    index = last;
  }
  return placed;
}
