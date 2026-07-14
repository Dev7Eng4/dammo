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
