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
  imagePaths: string[];
  audioPath: string;
  subtitlePath: string;
  language: string;
  onLog?: (msg: string) => void;
}
