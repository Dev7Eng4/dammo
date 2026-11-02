import fs from 'node:fs/promises';
import path from 'node:path';
import { parseSrt, srtTimestampToMs } from '../../infrastructure/subtitle/srt-utils.js';
import {
  AI_SCENE_PROMPTS_FILENAME,
  AI_SLIDES_DIRNAME,
  AI_VIDEOS_DIRNAME,
} from '../video-production/shared/ai-video/ai-video.constants.js';
import { msToSrtTimestamp } from '../video-production/shared/ai-video/ai-video-scene-timing.js';
import type { AiVideoScenePrompt } from '../video-production/shared/ai-video/ai-video.types.js';

/** Scenes with their image paths, as handed to the assembler. */
export const SCENES_FILE = 'scenes-with-images.json';
/** Copy of the subtitle the current scene times were cut against. */
export const SCENE_TIMING_SNAPSHOT = 'scenes-timing.srt';

/**
 * Piecewise-linear map through matching (old, new) time points, which start at (0, 0);
 * past the last point it continues with the last segment's slope.
 */
function buildTimeMap(points: Array<[number, number]>): (ms: number) => number {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  return ms => {
    if (ms <= sorted[0][0]) return sorted[0][1];
    for (let i = 1; i < sorted.length; i++) {
      const [x0, y0] = sorted[i - 1];
      const [x1, y1] = sorted[i];
      if (ms <= x1) return x1 === x0 ? y1 : y0 + ((ms - x0) * (y1 - y0)) / (x1 - x0);
    }
    const [xa, ya] = sorted[sorted.length - 2] ?? [0, 0];
    const [xb, yb] = sorted[sorted.length - 1];
    const slope = xb === xa ? 1 : (yb - ya) / (xb - xa);
    return yb + (ms - xb) * slope;
  };
}

/**
 * Moves scene boundaries from the subtitle they were cut against onto a new subtitle of the same script
 * (estimated timing → real voice, or one voice speed → another). Both tracks split the script into the
 * same cues, so each cue's start/end anchors the mapping; between anchors time is interpolated.
 * Returns false when there are no scenes or nothing changed.
 */
export async function retimeScenesToSubtitle(workDir: string, targetSubtitlePath: string): Promise<boolean> {
  const scenesPath = path.join(workDir, SCENES_FILE);
  const snapshotPath = path.join(workDir, SCENE_TIMING_SNAPSHOT);
  const [scenesRaw, snapshot, target] = await Promise.all([
    fs.readFile(scenesPath, 'utf8').catch(() => null),
    fs.readFile(snapshotPath, 'utf8').catch(() => null),
    fs.readFile(targetSubtitlePath, 'utf8'),
  ]);
  if (!scenesRaw || snapshot === null || snapshot === target) return false;

  const from = parseSrt(snapshot);
  const to = parseSrt(target);
  let points: Array<[number, number]>;
  if (from.length === to.length && from.length > 0) {
    points = from.flatMap((block, index) => [
      [srtTimestampToMs(block.start), srtTimestampToMs(to[index].start)] as [number, number],
      [srtTimestampToMs(block.end), srtTimestampToMs(to[index].end)] as [number, number],
    ]);
  } else {
    // Different cue split (script edited in between): fall back to stretching by total length.
    const fromEnd = srtTimestampToMs(from[from.length - 1]?.end ?? '00:00:00,000');
    const toEnd = srtTimestampToMs(to[to.length - 1]?.end ?? '00:00:00,000');
    points = [[0, 0], [Math.max(1, fromEnd), toEnd]];
  }
  const map = buildTimeMap([[0, 0], ...points]);

  const scenes = JSON.parse(scenesRaw) as AiVideoScenePrompt[];
  const retimed = scenes.map(scene => ({
    ...scene,
    startTime: msToSrtTimestamp(map(srtTimestampToMs(scene.startTime))),
    endTime: msToSrtTimestamp(map(srtTimestampToMs(scene.endTime))),
  }));
  await fs.writeFile(scenesPath, JSON.stringify(retimed, null, 2), 'utf8');
  await fs.writeFile(snapshotPath, target, 'utf8');
  return true;
}

/** Remembers which subtitle the freshly generated scenes were cut against. */
export async function snapshotSceneTiming(workDir: string, subtitlePath: string): Promise<void> {
  await fs.copyFile(subtitlePath, path.join(workDir, SCENE_TIMING_SNAPSHOT));
}

/** Removes scene prompts, images and clips made for a previous version of the script. */
export async function clearSceneArtifacts(workDir: string): Promise<void> {
  await Promise.all(
    [AI_SLIDES_DIRNAME, AI_VIDEOS_DIRNAME, AI_SCENE_PROMPTS_FILENAME, SCENES_FILE, SCENE_TIMING_SNAPSHOT, 'transcript-provisional.srt'].map(name =>
      fs.rm(path.join(workDir, name), { recursive: true, force: true }),
    ),
  );
}
