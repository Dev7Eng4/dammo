import type { Page } from 'playwright';
import type {
  LlmBrowserProvider,
  LlmBrowserResponse,
  LlmReceiveResponseOptions,
  LlmSendPromptOptions,
  LlmSetupConfig,
} from './llm-browser.types.js';

export interface LlmBrowserProviderHandler {
  readonly provider: LlmBrowserProvider;
  open(page: Page): Promise<void>;
  setupConfig(page: Page, config: LlmSetupConfig): Promise<void>;
  sendPrompt(page: Page, prompt: string, options?: LlmSendPromptOptions): Promise<void>;
  receiveResponse(page: Page, options?: LlmReceiveResponseOptions): Promise<LlmBrowserResponse>;
}
