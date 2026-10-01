import type { AiSceneDensityMaxSec, AiVideoDensityLevel } from './ai-video.constants.js';
import type { MetaConcurrencyMode } from '../../../llm-browser/meta/meta.types.js';
import type { CaptionStyleKey } from '../render-core/caption-styles.js';
import type { PromptLanguage } from '../../../prompts/prompts.types.js';
import type { ImageSceneFlow } from '../../../prompts/image-scene-flow.js';
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
  /** Human-readable niche from metadata (`detected_niche`); passed into scene prompt templates. */
  detectedNiche?: string;
  /** When set, only the first N seconds of transcript are used for scene prompts. */
  maxTranscriptSec?: number;
  /** Per-density max scene duration override (defaults 8 / 30 / 60). */
  densityMaxSceneSec?: AiSceneDensityMaxSec;
  /** Use the 2-step reference flow (character design + scene prompts). */
  useReferenceImage?: boolean;
  /**
   * Scene-image prompt flow resolved for the channel niche (see `promptsRepository.findImageSceneFlow`).
   * When omitted, the default `all` keys (`image_scenes` / `image_scenes_with_references_step_*`) are used.
   */
  sceneImageFlow?: ImageSceneFlow;
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
  /**
   * 0-based scene indexes to regenerate even when the slide image already exists.
   * Existing files for these indexes are deleted before generation.
   */
  forceIndexes?: number[];
  /** Persisted audio speed from ai-render-config.json. */
  audioSpeed?: number;
  audioPath?: string;
  /** Saved Ken Burns flag from ai-render-config.json. Prebake runs only when this is true. */
  kenBurns?: boolean;
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
