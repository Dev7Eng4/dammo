import type { PromptLanguage } from './prompt';

export interface Niche {
  key: string;
  label: string;
  language: PromptLanguage;
  createdAt: string;
}

export interface NichesResponse {
  items: Niche[];
}

export interface CreateNichePayload {
  label: string;
  language: PromptLanguage;
}

export interface UpdateNichePayload {
  label: string;
  language?: PromptLanguage;
}

export interface AddNicheFormValues {
  label: string;
  language: PromptLanguage;
}

export type NicheMutationAction = 'create' | 'update' | 'delete';

export interface NicheUsageItem {
  id: string;
  name: string;
}

export interface NicheUsage {
  inUse: boolean;
  prompts: NicheUsageItem[];
  sourceChannels: NicheUsageItem[];
  youtubeChannels: NicheUsageItem[];
}
