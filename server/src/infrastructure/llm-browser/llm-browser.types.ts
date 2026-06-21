export type LlmTextProvider = 'gpt' | 'gemini';
export type ImageBrowserProvider = 'flow';
export type LlmBrowserProvider = LlmTextProvider | ImageBrowserProvider;

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

/** @deprecated Use LlmTextReceiveResponseOptions or FlowReceiveResponseOptions */
export type LlmReceiveResponseOptions = FlowReceiveResponseOptions;

export interface LlmSendPromptOptions {
  submitWith?: 'enter' | 'button';
  /** 'human' = clipboard/typing; 'direct' = set contenteditable đồng bộ (cho prompt dài). */
  pasteStrategy?: 'human' | 'direct' | 'insertText';
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
}

export interface FlowGenerateImageOptions {
  projectId?: string;
  outputPath?: string;
  outputDir?: string;
  fileName?: string;
  debugScreenshotPath?: string;
  timeoutMs?: number;
  stableMs?: number;
  pasteStrategy?: LlmSendPromptOptions['pasteStrategy'];
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
