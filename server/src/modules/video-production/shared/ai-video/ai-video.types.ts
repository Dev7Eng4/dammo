import type { AiSceneDensityMaxSec, AiVideoDensityLevel } from './ai-video.constants.js';
import type { MetaConcurrencyMode } from '../../../../infrastructure/llm-browser/llm-browser.types.js';
import type { CaptionStyleKey } from '../render-core/caption-styles.js';
import type { PromptLanguage } from '../../../prompts/prompts.types.js';
import type { SlideSpec } from '../slideshow/slideshow.types.js';

export type { MetaConcurrencyMode };

/** @deprecated Use MetaConcurrencyMode — alias kept for existing ai-video callers. */
export type MetaImageConcurrencyMode = MetaConcurrencyMode;
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
  /** Character ids from image_scenes_with_references_step_2 (scene-with-reference) output. */
  references?: string[];
  /** Relative path under workDir when image exists, e.g. images/scene-001.jpg */
  path?: string;
}

export interface AiVideoCharacterReference {
  id: string;
  name: string;
  description: string;
  prompt: string;
  /** Relative path under workDir when image exists, e.g. image-references/tanaka.jpg */
  path?: string;
}

export interface AiVideoCharacterReferencesFile {
  youtubeVideoId: string;
  generatedAt: string;
  characterCount: number;
  characters: AiVideoCharacterReference[];
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
  /** When set, only the first N seconds of transcript are used for scene prompts. */
  maxTranscriptSec?: number;
  /** Per-density max scene duration override (defaults 8 / 30 / 60). */
  densityMaxSceneSec?: AiSceneDensityMaxSec;
  /** Use image_scenes_with_references_step_1 + step_2; pause before scene images. */
  useReferenceImage?: boolean;
  onLog?: (msg: string) => void;
  onProgress?: (progress: {
    density: AiVideoDensityLevel;
    chunkIndex: number;
    totalChunks: number;
    attempt: number;
  }) => void;
}

export interface GenerateAiVideoImagesWithCharactersResult extends GenerateAiVideoImagesResult {
  characters: AiVideoCharacterReference[];
  characterFilePath: string;
  imageReferencesDir: string;
  /** True when scene image generation should be skipped (reference flow phase 1). */
  pauseBeforeSceneImages: boolean;
}

export interface AssembleReupAiSlideshowVideoInput {
  workDir: string;
  scenes: AiVideoScenePrompt[];
  audioPath: string;
  subtitlePath: string;
  language: string;
  captionStyleKey?: CaptionStyleKey;
  /** Final mp4 basename without extension (default: video). */
  outputBasename?: string;
  /** Temporary: burn top-left disclaimer for the first N seconds. */
  showDisclaim?: boolean;
  disclaimerText?: string;
  channelAvatarPath?: string;
  showSmallVideo?: boolean;
  /** Filename under assets/small-video (or `__auto__`). Ignored when `smallVideoPath` is set. */
  smallVideoFile?: string;
  /** Absolute path to a small-video clip (test / local override). */
  smallVideoPath?: string;
  onLog?: (msg: string) => void;
}

export interface GenerateAiSceneSlideImagesInput {
  workDir: string;
  youtubeVideoId: string;
  scenes: AiVideoScenePrompt[];
  /** Persisted audio speed from ai-render-config.json. Required when SS_ENABLE_KEN_BURNS. */
  audioSpeed?: number;
  audioPath?: string;
  /** Precomputed final SlideSpec per scene name (scene-001, …) for incremental Ken Burns prebake. */
  assumedFinalSlidesByName?: ReadonlyMap<string, SlideSpec>;
  /** Meta only. Default `batch`. */
  metaConcurrency?: MetaImageConcurrencyMode;
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
