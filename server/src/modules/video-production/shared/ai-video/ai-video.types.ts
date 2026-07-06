import type { VideoMetaOutput } from '../meta/metadata.types.js';

export interface AiVideoVisualStyle {
  name: string;
  rule: string;
  niche: string;
}

export interface GenerateAiVideoImagesInput {
  workDir: string;
  youtubeVideoId: string;
  visualStyle: AiVideoVisualStyle;
  /** Optional hero prompt from video metadata */
  videoMetaOutput?: VideoMetaOutput;
  /** @deprecated Use videoMetaOutput */
  metaStep3Output?: VideoMetaOutput;
  slideCount?: number;
  onLog?: (msg: string) => void;
  onProgress?: (progress: { slideIndex: number; totalSlides: number; attempt: number }) => void;
}

export interface AssembleReupAiSlideshowVideoInput {
  workDir: string;
  imagePaths: string[];
  audioPath: string;
  subtitlePath: string;
  language: string;
  onLog?: (msg: string) => void;
}
