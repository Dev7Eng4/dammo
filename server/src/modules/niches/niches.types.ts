import type { PromptLanguage } from '../prompts/prompts.types.js';

export interface Niche {
  key: string;
  label: string;
  language: PromptLanguage;
  createdAt: string;
}

export interface NichesStore {
  niches: Niche[];
}

export interface CreateNicheInput {
  label: string;
  language: PromptLanguage;
}

export interface UpdateNicheInput {
  label: string;
  language?: PromptLanguage;
}
