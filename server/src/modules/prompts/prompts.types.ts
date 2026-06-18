export type PromptCategory = 'thumbnail' | 'transcript' | 'meta' | 'image';

export type PromptLanguage = 'en' | 'ko' | 'ja' | 'es';

export interface Prompt {
  id: string;
  key: string;
  language: PromptLanguage;
  name: string;
  category: PromptCategory;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromptsStore {
  prompts: Prompt[];
}

export interface CreatePromptInput {
  key: string;
  language: PromptLanguage;
  name: string;
  template: string;
  category?: PromptCategory;
  description?: string;
}

export interface UpdatePromptInput {
  key?: string;
  language?: PromptLanguage;
  name?: string;
  template?: string;
  category?: PromptCategory;
  description?: string;
}

export interface PromptResolved extends Prompt {
  template: string;
}
