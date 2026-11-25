import fs from 'node:fs/promises';
import path from 'node:path';
import { parseSrt, srtTimestampToMs } from '../../infrastructure/subtitle/srt-utils.js';
import { resolveAiScenePromptsFilePath } from '../video-production/shared/ai-video/ai-video-scene-prompts-store.js';
import {
  AI_SCENE_PROMPTS_FILENAME,
  AI_SLIDES_DIRNAME,
  AI_VIDEOS_DIRNAME,
} from '../video-production/shared/ai-video/ai-video.constants.js';
import { msToSrtTimestamp } from '../video-production/shared/ai-video/ai-video-scene-timing.js';
import type { AiVideoScenePrompt, AiVideoScenePromptsFile } from '../video-production/shared/ai-video/ai-video.types.js';

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

interface TimedSentence {
  text: string;
  startMs: number;
  endMs: number;
}

const SENTENCE_END = /[。！？!?][」』）)]*$/;

/** Joins cues into sentences (a cue ending in 。！？ closes one), so a different caption split still lines up. */
function subtitleSentences(srt: string): TimedSentence[] {
  const sentences: TimedSentence[] = [];
  let current: TimedSentence | undefined;
  for (const block of parseSrt(srt)) {
    const text = block.text.replace(/\s+/g, '');
    if (!text) continue;
    const startMs = srtTimestampToMs(block.start);
    const endMs = srtTimestampToMs(block.end);
    const next: TimedSentence = current ? { text: current.text + text, startMs: current.startMs, endMs } : { text, startMs, endMs };
    current = next;
    if (SENTENCE_END.test(text)) {
      sentences.push(next);
      current = undefined;
    }
  }
  if (current) sentences.push(current);
  return sentences;
}

/** Index pairs of equal sentences, in order (longest common subsequence). */
function matchSentences(from: TimedSentence[], to: TimedSentence[]): Array<[number, number]> {
  const n = from.length;
  const m = to.length;
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = from[i].text === to[j].text ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (from[i].text === to[j].text) pairs.push([i++, j++]);
    else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

export interface SubtitleTimeMap {
  map: (ms: number) => number;
  /** Share of the new track's sentences found unchanged in the old one (1 = same script, only the voice changed). */
  matchedRatio: number;
}

/**
 * Time map from one subtitle track onto another of the same video. Same cues → cue by cue. Otherwise
 * sentences that are in both tracks anchor the map (re-split captions, a few edited lines); with none in
 * common it stretches by total length.
 */
export function subtitleTimeMap(fromSrt: string, toSrt: string): SubtitleTimeMap {
  const from = parseSrt(fromSrt);
  const to = parseSrt(toSrt);
  let points: Array<[number, number]>;
  let matchedRatio: number;
  if (from.length === to.length && from.length > 0 && from.every((block, index) => block.text === to[index].text)) {
    points = from.flatMap((block, index) => [
      [srtTimestampToMs(block.start), srtTimestampToMs(to[index].start)] as [number, number],
      [srtTimestampToMs(block.end), srtTimestampToMs(to[index].end)] as [number, number],
    ]);
    matchedRatio = 1;
  } else {
    const fromSentences = subtitleSentences(fromSrt);
    const toSentences = subtitleSentences(toSrt);
    const pairs = matchSentences(fromSentences, toSentences);
    matchedRatio = toSentences.length ? pairs.length / toSentences.length : 0;
    points = pairs.flatMap(([i, j]) => [
      [fromSentences[i].startMs, toSentences[j].startMs] as [number, number],
      [fromSentences[i].endMs, toSentences[j].endMs] as [number, number],
    ]);
    const fromEnd = fromSentences.at(-1)?.endMs ?? 0;
    const toEnd = toSentences.at(-1)?.endMs ?? 0;
    if (!pairs.length || pairs.at(-1)![0] !== fromSentences.length - 1) points.push([Math.max(1, fromEnd), toEnd]);
  }
  return { map: buildTimeMap([[0, 0], ...points]), matchedRatio };
}

/**
 * Moves the scenes of a channel video (ai-scene-prompts.json) from the subtitle they were cut against onto
 * the new narration's subtitle. Returns null when the video has no scenes yet.
 */
export async function retimeScenePromptsFile(
  workDir: string,
  fromSrt: string,
  toSrt: string,
): Promise<{ scenes: number; matchedRatio: number } | null> {
  const filePath = resolveAiScenePromptsFilePath(workDir);
  const raw = await fs.readFile(filePath, 'utf8').catch(() => null);
  if (!raw) return null;
  const file = JSON.parse(raw) as AiVideoScenePromptsFile;
  if (!file.scenes?.length) return null;
  const { map, matchedRatio } = subtitleTimeMap(fromSrt, toSrt);
  file.scenes = file.scenes.map(scene => ({
    ...scene,
    startTime: msToSrtTimestamp(map(srtTimestampToMs(scene.startTime))),
    endTime: msToSrtTimestamp(map(srtTimestampToMs(scene.endTime))),
  }));
  await fs.writeFile(filePath, JSON.stringify(file, null, 2), 'utf8');
  return { scenes: file.scenes.length, matchedRatio };
}

/**
 * Moves scene boundaries from the subtitle they were cut against onto a new subtitle of the same script
 * (estimated timing → real voice, or one voice speed → another). Both tracks split the script into the
 * same cues, so each cue's start/end anchors the mapping; between anchors time is interpolated
 * (see subtitleTimeMap for tracks that were split differently).
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

  const { map } = subtitleTimeMap(snapshot, target);

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
