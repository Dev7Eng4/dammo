import type { LlmSendPromptOptions } from '../core/types.js';

export interface MetaGenerateMediaOptions {
  outputPath?: string;
  outputDir?: string;
  fileName?: string;
  debugScreenshotPath?: string;
  timeoutMs?: number;
  stableMs?: number;
  pasteStrategy?: LlmSendPromptOptions['pasteStrategy'];
  mediaKind?: 'image' | 'video' | 'auto';
  /** Image prompt aspect ratio prefix. Default: '16:9'. */
  aspectRatio?: '16:9' | '3:4';
  /** Local paths to attach as reference images before the prompt (Meta only). */
  referenceImagePaths?: string[];
}

/** Meta worker pool: batch = multi-tab/profile parallel; single = 1 tab sequential. */
export type MetaConcurrencyMode = 'batch' | 'single';

export interface MetaMediaBatchJob {
  /** Log / result key (e.g. scene-001, char_001). */
  id: string;
  prompt: string;
  outputDir: string;
  fileName: string;
  referenceImagePaths?: string[];
  aspectRatio?: '16:9' | '3:4';
  mediaKind?: 'image' | 'video' | 'auto';
}

export interface MetaGenerateMediaBatchOptions {
  /** Default `batch`. */
  concurrency?: MetaConcurrencyMode;
  timeoutMs?: number;
  /** Default 3. */
  maxRetries?: number;
  pasteStrategy?: LlmSendPromptOptions['pasteStrategy'];
  onLog?: (msg: string) => void;
  onJobProgress?: (progress: {
    jobId: string;
    index: number;
    total: number;
    status: 'generating' | 'done' | 'failed';
  }) => void;
}

export interface MetaMediaBatchJobResult {
  id: string;
  ok: boolean;
  localPath?: string;
  error?: string;
}

export interface MetaMediaBatchResult {
  results: MetaMediaBatchJobResult[];
  generatedCount: number;
  failedCount: number;
}
