import fs from 'node:fs/promises';
import path from 'node:path';
import { srtTimestampToMs } from '../../../../infrastructure/subtitle/srt-utils.js';
import { AI_SLIDES_DIRNAME } from './ai-video.constants.js';
import type { AiVideoScenePrompt } from './ai-video.types.js';

export function msToSrtTimestamp(totalMs: number): string {
  const ms = Math.max(0, Math.round(totalMs));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);
  const millis = ms % 1_000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

function buildSceneRelativePath(index: number): string {
  return path.posix.join(AI_SLIDES_DIRNAME, `scene-${String(index + 1).padStart(3, '0')}.jpg`);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Attach relative `path` for each scene when the corresponding slide image exists.
 * Clears `path` when the image is missing.
 */
export async function attachSceneImagePaths(
  scenes: AiVideoScenePrompt[],
  workDir: string,
): Promise<AiVideoScenePrompt[]> {
  const result: AiVideoScenePrompt[] = [];

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const relativePath = buildSceneRelativePath(index);
    const absolutePath = path.join(workDir, relativePath);
    const hasImage = await fileExists(absolutePath);

    if (hasImage) {
      result.push({ ...scene, path: relativePath });
    } else {
      const { path: _removed, ...rest } = scene;
      result.push(rest);
    }
  }

  return result;
}

/**
 * Redistribute time around scenes without `path` onto neighboring scenes that have images.
 *
 * Between two successes: mid = (prev.end + next.start) / 2 → extend prev to mid, start next at mid.
 * Leading failures: next.start = first failure start.
 * Trailing failures: prev.end = last failure end.
 */
export function redistributeMissingSceneTimes(scenes: AiVideoScenePrompt[]): AiVideoScenePrompt[] {
  if (scenes.length === 0) return [];

  const next = scenes.map(scene => ({ ...scene }));
  let index = 0;

  while (index < next.length) {
    if (next[index].path) {
      index += 1;
      continue;
    }

    const gapStart = index;
    while (index < next.length && !next[index].path) {
      index += 1;
    }
    const gapEnd = index - 1;

    const prevIndex = gapStart - 1;
    const nextIndex = gapEnd + 1;
    const hasPrev = prevIndex >= 0 && Boolean(next[prevIndex].path);
    const hasNext = nextIndex < next.length && Boolean(next[nextIndex].path);

    if (hasPrev && hasNext) {
      const prevEndMs = srtTimestampToMs(next[prevIndex].endTime);
      const nextStartMs = srtTimestampToMs(next[nextIndex].startTime);
      const midMs = Math.round((prevEndMs + nextStartMs) / 2);
      next[prevIndex] = { ...next[prevIndex], endTime: msToSrtTimestamp(midMs) };
      next[nextIndex] = { ...next[nextIndex], startTime: msToSrtTimestamp(midMs) };
    } else if (!hasPrev && hasNext) {
      next[nextIndex] = {
        ...next[nextIndex],
        startTime: next[gapStart].startTime,
      };
    } else if (hasPrev && !hasNext) {
      next[prevIndex] = {
        ...next[prevIndex],
        endTime: next[gapEnd].endTime,
      };
    }
  }

  return next;
}

export function scenesWithImagePaths(scenes: AiVideoScenePrompt[]): AiVideoScenePrompt[] {
  return scenes.filter(scene => Boolean(scene.path?.trim()));
}

export function resolveSceneImageAbsolutePath(workDir: string, scene: AiVideoScenePrompt): string {
  if (!scene.path?.trim()) {
    throw new Error('Scene has no image path');
  }
  return path.isAbsolute(scene.path) ? scene.path : path.join(workDir, scene.path);
}

export function sceneDurationSec(scene: AiVideoScenePrompt): number {
  const startMs = srtTimestampToMs(scene.startTime);
  const endMs = srtTimestampToMs(scene.endTime);
  return Math.max(0.2, (endMs - startMs) / 1_000);
}

export interface ImageTimelineEntry {
  /** Index into the scene list passed in. */
  index: number;
  /** When the image takes over on screen, in seconds on the scenes' own clock. */
  startSec: number;
}

/** An image squeezed below this by an overlapping scene is left out instead of flashing by. */
const MIN_IMAGE_WINDOW_SEC = 1;

/**
 * When each scene image takes over on screen. Scenes without an image have no entry, so the image
 * before them simply stays (the first image also covers everything before its own start).
 *
 * Every start comes from the scene timestamps, never from summed durations: overlapping or missing
 * scenes stay a local matter and cannot shift the images after them. Overlapping scenes meet in the
 * middle of their overlap, except that a title card keeps its exact range. Scenes are taken in order
 * of their end time, which also puts scenes back in place when the timestamps went backwards.
 */
export function resolveImageTimeline(scenes: AiVideoScenePrompt[]): ImageTimelineEntry[] {
  const windows = scenes
    .map((scene, index) => {
      const start = srtTimestampToMs(scene.startTime) / 1_000;
      const end = Math.max(start, srtTimestampToMs(scene.endTime) / 1_000);
      return { index, start, end, hasImage: Boolean(scene.path?.trim()), title: scene.type === 'title' };
    })
    .filter(window => window.hasImage)
    .sort((a, b) => a.end - b.end || a.index - b.index);

  for (;;) {
    const starts = windows.map((window, i) => {
      const prev = windows[i - 1];
      if (!prev || prev.end <= window.start || window.title) return window.start;
      if (prev.title) return prev.end;
      return (Math.max(prev.start, window.start) + Math.min(prev.end, window.end)) / 2;
    });

    let dropAt = -1;
    let smallest = Infinity;
    for (let i = 0; i < windows.length - 1; i += 1) {
      const window = windows[i]!;
      const visible = starts[i + 1]! - starts[i]!;
      const wanted = Math.min(MIN_IMAGE_WINDOW_SEC, Math.max(0.1, window.end - window.start));
      if (!window.title && visible < wanted - 0.001 && visible < smallest) {
        smallest = visible;
        dropAt = i;
      }
    }
    if (dropAt === -1) return windows.map((window, i) => ({ index: window.index, startSec: starts[i]! }));
    windows.splice(dropAt, 1);
  }
}

/** Scale scene start/end to match audio after atempo (factor = 1/speed), same as scaleSrtTimestamps. */
export function scaleSceneTimestamps(
  scenes: AiVideoScenePrompt[],
  speed: number,
): AiVideoScenePrompt[] {
  if (speed === 1) return scenes.map(scene => ({ ...scene }));
  const factor = 1 / speed;
  return scenes.map(scene => ({
    ...scene,
    startTime: msToSrtTimestamp(srtTimestampToMs(scene.startTime) * factor),
    endTime: msToSrtTimestamp(srtTimestampToMs(scene.endTime) * factor),
  }));
}
