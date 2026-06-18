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
}

export interface LlmSendPromptOptions {
  submitWith?: 'enter' | 'button';
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
}
