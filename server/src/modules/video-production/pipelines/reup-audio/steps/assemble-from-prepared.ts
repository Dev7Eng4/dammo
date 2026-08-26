import fs from 'node:fs/promises';
import path from 'node:path';
import {
  attachSceneImagePaths,
  redistributeMissingSceneTimes,
  resolveAiScenePromptsFilePath,
  scenesWithImagePaths,
} from '../../../shared/ai-video/index.js';
import { AI_SLIDES_DIRNAME } from '../../../shared/ai-video/ai-video.constants.js';
import type { AiVideoScenePrompt, AiVideoScenePromptsFile } from '../../../shared/ai-video/ai-video.types.js';
import type { VisualAssets } from '../strategies/index.js';

export const PREPARED_AUDIO_FILE = 'audio.mp3';
/** Prefer LLM-updated SRT (matches main pipeline), then cleaned SRT. */
export const PREPARED_SUBTITLE_FILES = ['transcript-updated.srt', 'transcript.srt'] as const;
const CENTER_IMAGE_FILE = 'background.jpg';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);

export async function findFirstExistingPath(...paths: string[]): Promise<string | null> {
  for (const candidate of paths) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

async function listAiSlideImages(slidesDir: string): Promise<string[]> {
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

function msToSrt(totalMs: number): string {
  const ms = Math.max(0, Math.round(totalMs));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);
  const millis = ms % 1_000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

async function loadAiScenesForAssemble(workDir: string): Promise<AiVideoScenePrompt[]> {
  const promptsPath = resolveAiScenePromptsFilePath(workDir);
  try {
    const raw = await fs.readFile(promptsPath, 'utf8');
    const parsed = JSON.parse(raw) as AiVideoScenePromptsFile;
    if (Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
      const withPaths = await attachSceneImagePaths(parsed.scenes, workDir);
      return redistributeMissingSceneTimes(withPaths);
    }
  } catch {
    // fall through to folder-only fallback
  }

  const imagePaths = await listAiSlideImages(path.join(workDir, AI_SLIDES_DIRNAME));
  const slideSec = 5;
  return imagePaths.map((imagePath, index) => {
    const startMs = index * slideSec * 1_000;
    const endMs = (index + 1) * slideSec * 1_000;
    return {
      prompt: '',
      startTime: msToSrt(startMs),
      endTime: msToSrt(endMs),
      path: path.relative(workDir, imagePath).split(path.sep).join('/'),
    };
  });
}

/**
 * Recover visual assets the pipeline would have produced in earlier steps from
 * an already-prepared video folder. Returns missing file names for a single
 * actionable error message.
 */
export async function collectVisualAssetsFromDisk(
  workDir: string,
  videoType: 'si' | 'ai',
  backgroundImage: string,
): Promise<{ assets: VisualAssets; missingFiles: string[] }> {
  const assets: VisualAssets = {};
  const missingFiles: string[] = [];

  if (videoType === 'ai') {
    const scenes = scenesWithImagePaths(await loadAiScenesForAssemble(workDir));
    if (scenes.length === 0) {
      missingFiles.push(`${AI_SLIDES_DIRNAME}/*.jpg`);
    } else {
      assets.aiScenePrompts = scenes;
    }
    return { assets, missingFiles };
  }

  if (backgroundImage === 'one_image') {
    const centerImagePath = path.join(workDir, CENTER_IMAGE_FILE);
    try {
      await fs.access(centerImagePath);
      assets.heroImagePath = centerImagePath;
    } catch {
      missingFiles.push(CENTER_IMAGE_FILE);
    }
  }

  return { assets, missingFiles };
}
