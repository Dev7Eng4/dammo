import fs from 'node:fs/promises';
import path from 'node:path';
import { srtTimestampToMs } from '../../../../infrastructure/subtitle/srt-utils.js';
import { AI_SCENE_PROMPTS_FILENAME } from './ai-video.constants.js';
import type { AiVideoScenePrompt, AiVideoScenePromptsFile } from './ai-video.types.js';

export interface SceneOverlap {
  index: number;
  startTime: string;
  previousEndTime: string;
}

/**
 * A scene starting before the previous scene ends means the timeline went backwards,
 * which happens when a chunk's prompts are duplicated from an earlier chunk.
 */
export function findOverlappingScenes(scenes: AiVideoScenePrompt[]): SceneOverlap[] {
  const overlaps: SceneOverlap[] = [];

  for (let index = 1; index < scenes.length; index += 1) {
    const previousEndMs = srtTimestampToMs(scenes[index - 1].endTime);
    const startMs = srtTimestampToMs(scenes[index].startTime);

    if (startMs < previousEndMs) {
      overlaps.push({
        index,
        startTime: scenes[index].startTime,
        previousEndTime: scenes[index - 1].endTime,
      });
    }
  }

  return overlaps;
}

export function resolveAiScenePromptsFilePath(workDir: string): string {
  return path.join(workDir, AI_SCENE_PROMPTS_FILENAME);
}

export function buildAiScenePromptsFile(
  youtubeVideoId: string,
  scenes: AiVideoScenePrompt[],
): AiVideoScenePromptsFile {
  return {
    youtubeVideoId,
    generatedAt: new Date().toISOString(),
    sceneCount: scenes.length,
    scenes,
  };
}

export async function persistAiScenePromptsFile(
  workDir: string,
  youtubeVideoId: string,
  scenes: AiVideoScenePrompt[],
): Promise<string> {
  await fs.mkdir(workDir, { recursive: true });
  const filePath = resolveAiScenePromptsFilePath(workDir);
  const payload = buildAiScenePromptsFile(youtubeVideoId, scenes);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}
