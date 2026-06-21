import type { LlmTextProvider } from '../../infrastructure/llm-browser/llm-browser.types.js';

export interface MetaLlmSession {
  profileId: string;
  profileName: string;
  provider: LlmTextProvider;
}
