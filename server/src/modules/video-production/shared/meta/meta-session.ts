import type { LlmTextProvider } from '../../../llm-browser/core/types.js';

export interface MetaLlmSession {
  profileId: string;
  profileName: string;
  provider: LlmTextProvider;
}
