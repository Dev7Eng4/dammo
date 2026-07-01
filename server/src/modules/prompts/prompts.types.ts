export type PromptCategory = 'thumbnail' | 'transcript' | 'meta' | 'image';

export type PromptOutputType = 'text' | 'image' | 'video';

export type PromptLanguage = 'en' | 'ko' | 'ja' | 'es';

export interface Prompt {
  id: string;
  key: string;
  language: PromptLanguage;
  name: string;
  category: PromptCategory;
  outputType?: PromptOutputType;
  description?: string;
  isSystem?: boolean;
  useReferenceImage?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromptsStore {
  prompts: Prompt[];
}

export interface CreatePromptInput {
  language: PromptLanguage;
  name: string;
  template: string;
  category?: PromptCategory;
  outputType?: PromptOutputType;
  description?: string;
  isSystem?: boolean;
  key?: string;
  useReferenceImage?: boolean;
}

export interface UpdatePromptInput {
  language?: PromptLanguage;
  name?: string;
  template?: string;
  category?: PromptCategory;
  outputType?: PromptOutputType;
  description?: string;
  useReferenceImage?: boolean;
}

export interface PromptResolved extends Prompt {
  template: string;
}
