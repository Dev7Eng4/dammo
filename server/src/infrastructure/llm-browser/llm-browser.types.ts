export type LlmTextProvider = 'gpt' | 'gemini';
export type ImageBrowserProvider = 'flow' | 'meta';
export type VideoBrowserProvider = 'meta';
export type LlmBrowserProvider = LlmTextProvider | ImageBrowserProvider | VideoBrowserProvider;

export type LlmSessionStatus = 'idle' | 'sending' | 'waiting';

export interface LlmSetupSelectors {
  modeButton?: string;
  modelButton?: string;
  optionByLabel?: string;
}

export interface LlmDomSelectors {
  promptInput: string;
  sendButton: string;
  responseBlocks: string;
  responseCodeBlocks?: string;
  generatingIndicator?: string;
  conversationScrollContainer?: string;
  copyResponseButton?: string;
}

export interface LlmProviderConfig {
  id: LlmTextProvider;
  url: string;
  selectors: LlmDomSelectors;
  setup?: LlmSetupSelectors;
}

export interface LlmSetupConfig {
  mode?: string;
  model?: string;
}

export interface LlmTextReceiveResponseOptions {
  timeoutMs?: number;
  stableMs?: number;
  /** Baseline block count trước khi submit prompt; mặc định lấy từ session sau send. */
  baselineBlockCount?: number;
}

export interface FlowReceiveResponseOptions extends LlmTextReceiveResponseOptions {
  projectId?: string;
  batchResponsePromise?: Promise<import('playwright').Response>;
  outputPath?: string;
  debugScreenshotPath?: string;
}

export interface MetaReceiveResponseOptions extends LlmTextReceiveResponseOptions {
  outputPath?: string;
  outputDir?: string;
  fileName?: string;
  debugScreenshotPath?: string;
  mediaKind?: 'image' | 'video' | 'auto';
  /** Image prompt aspect ratio prefix. Default: '16:9'. */
  aspectRatio?: '16:9' | '3:4';
  baselineMediaCount?: number;
}

export type LlmReceiveResponseOptions = FlowReceiveResponseOptions & MetaReceiveResponseOptions;

export interface LlmSendPromptOptions {
  submitWith?: 'enter' | 'button';
  /** Default/recommended: 'human' (clipboard, then sequential typing). 'direct' / 'insertText' still supported but unused by production. */
  pasteStrategy?: 'human' | 'direct' | 'insertText';
  /** Single reference image (Flow/Meta). Prefer referenceImagePaths for multiple. */
  referenceImagePath?: string;
  /** Multiple local reference images (Flow browser/API + Meta). */
  referenceImagePaths?: string[];
}
export interface LlmTextChatOptions extends LlmTextReceiveResponseOptions, LlmSendPromptOptions {}

export interface LlmSendPromptResult {
  baselineBlockCount: number;
}

export interface LlmMediaAsset {
  kind: 'image' | 'video';
  sourceUrl?: string;
  localPath?: string;
}

export interface FlowOpenOptions {
  projectId?: string;
  /** Skip DOM config setup (Image / 16:9 / model) — used for API generation mode. */
  skipInitialSetup?: boolean;
}

export type FlowGenerationMode = 'browser' | 'api';

export interface FlowGenerateImageOptions {
  projectId?: string;
  outputPath?: string;
  outputDir?: string;
  fileName?: string;
  debugScreenshotPath?: string;
  timeoutMs?: number;
  stableMs?: number;
  pasteStrategy?: LlmSendPromptOptions['pasteStrategy'];
  /** Single reference image. Prefer referenceImagePaths for multiple. */
  referenceImagePath?: string;
  /** Multiple local reference images (uploaded/attached in order). */
  referenceImagePaths?: string[];
  /** Default: 'browser'. Use 'api' for direct Flow API calls. */
  generationMode?: FlowGenerationMode;
}

export interface FlowToolVisual {
  name: string;
  prompt: string;
  /** Optional reference image URLs / ids for the custom Flow tool. */
  references?: string[];
}

export interface FlowGenerateImagesViaToolOptions {
  projectId?: string;
  toolId?: string;
  outputDir: string;
  timeoutMs?: number;
  debugScreenshotPath?: string;
  /** Called after each image is downloaded and saved to disk. */
  onImageSaved?: (saved: { name: string; outputPath: string }) => void | Promise<void>;
}

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

/** @deprecated Use FlowGenerateImageOptions */
export type LlmGenerateImageOptions = FlowGenerateImageOptions & {
  provider?: ImageBrowserProvider;
};

export interface LlmBrowserResponse {
  provider: LlmBrowserProvider;
  content: string;
  codeBlocks: string[];
  elapsedMs: number;
  mediaAssets?: LlmMediaAsset[];
}

export interface LlmBrowserSession {
  profileId: string;
  provider: LlmBrowserProvider;
  openedAt: string;
  status: LlmSessionStatus;
  /** Snapshot số block trước khi submit prompt lần gửi gần nhất. */
  pendingBaselineBlockCount?: number;
}
