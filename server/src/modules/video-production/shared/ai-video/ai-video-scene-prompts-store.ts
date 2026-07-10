import fs from 'node:fs/promises';
import path from 'node:path';
import { AI_SCENE_PROMPTS_FILENAME } from './ai-video.constants.js';
import type { AiVideoScenePrompt, AiVideoScenePromptsFile } from './ai-video.types.js';

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
