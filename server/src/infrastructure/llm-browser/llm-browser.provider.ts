import type { Page } from 'playwright';
import type {
  FlowOpenOptions,
  LlmBrowserProvider,
  LlmBrowserResponse,
  LlmReceiveResponseOptions,
  LlmSendPromptOptions,
  LlmSendPromptResult,
  LlmSetupConfig,
} from './llm-browser.types.js';

export interface LlmBrowserProviderHandler {
  readonly provider: LlmBrowserProvider;
  open(page: Page, options?: FlowOpenOptions): Promise<void>;
  setupConfig(page: Page, config: LlmSetupConfig): Promise<void>;
  readConversationIfNeeded(page: Page): Promise<void>;
  sendPrompt(page: Page, prompt: string, options?: LlmSendPromptOptions): Promise<LlmSendPromptResult | void>;
  receiveResponse(page: Page, options?: LlmReceiveResponseOptions): Promise<LlmBrowserResponse>;
}
