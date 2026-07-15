import type { CaptionStyleKey } from '../si-video/caption-styles.js';
import type { PromptLanguage } from '../../../prompts/prompts.types.js';
import type { AiVideoDensityLevel } from './ai-video.constants.js';

export interface AiVideoVisualStyle {
  name: string;
  rule: string;
  niche: string;
}

export interface TranscriptCue {
  text: string;
  startTime: string;
  endTime: string;
}

export interface AiVideoScenePrompt {
  prompt: string;
  startTime: string;
  endTime: string;
  /** Relative path under workDir when image exists, e.g. ai-slides/scene-001.jpg */
  path?: string;
}

export interface AiVideoScenePromptsFile {
  youtubeVideoId: string;
  generatedAt: string;
  sceneCount: number;
  scenes: AiVideoScenePrompt[];
}

export interface GenerateAiVideoImagesResult {
  scenes: AiVideoScenePrompt[];
  filePath: string;
}

export interface GenerateAiVideoImagesInput {
  workDir: string;
  youtubeVideoId: string;
  visualStyle: AiVideoVisualStyle;
  subtitlePath: string;
  audioPath?: string;
  language: PromptLanguage;
  onLog?: (msg: string) => void;
  onProgress?: (progress: {
    density: AiVideoDensityLevel;
    chunkIndex: number;
    totalChunks: number;
    attempt: number;
  }) => void;
}

export interface AssembleReupAiSlideshowVideoInput {
  workDir: string;
  scenes: AiVideoScenePrompt[];
  audioPath: string;
  subtitlePath: string;
  language: string;
  captionStyleKey?: CaptionStyleKey;
  onLog?: (msg: string) => void;
}

export interface GenerateAiSceneSlideImagesInput {
  workDir: string;
  youtubeVideoId: string;
  scenes: AiVideoScenePrompt[];
  onLog?: (msg: string) => void;
  onProgress?: (progress: {
    sceneIndex: number;
    totalScenes: number;
    batchIndex?: number;
    totalBatches?: number;
    sceneName: string;
    status: 'generating' | 'skipped';
  }) => void;
}

export interface GenerateAiSceneSlideImagesResult {
  slidesDir: string;
  imagePaths: string[];
  scenes: AiVideoScenePrompt[];
  generatedCount: number;
  skippedCount: number;
  failedCount: number;
}
