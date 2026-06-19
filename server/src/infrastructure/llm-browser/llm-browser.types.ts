export type LlmBrowserProvider = 'gpt' | 'gemini';

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
  id: LlmBrowserProvider;
  url: string;
  selectors: LlmDomSelectors;
  setup?: LlmSetupSelectors;
}

export interface LlmSetupConfig {
  mode?: string;
  model?: string;
}

export interface LlmReceiveResponseOptions {
  timeoutMs?: number;
  stableMs?: number;
  /** Baseline block count trước khi submit prompt; mặc định lấy từ session sau send. */
  baselineBlockCount?: number;
}

export interface LlmSendPromptOptions {
  submitWith?: 'enter' | 'button';
  /** 'human' = clipboard/typing; 'direct' = set contenteditable đồng bộ (cho prompt dài). */
  pasteStrategy?: 'human' | 'direct';
}

export interface LlmSendPromptResult {
  baselineBlockCount: number;
}

export interface LlmBrowserResponse {
  provider: LlmBrowserProvider;
  content: string;
  codeBlocks: string[];
  elapsedMs: number;
}

export interface LlmBrowserSession {
  profileId: string;
  provider: LlmBrowserProvider;
  openedAt: string;
  status: LlmSessionStatus;
  /** Snapshot số block trước khi submit prompt lần gửi gần nhất. */
  pendingBaselineBlockCount?: number;
}
