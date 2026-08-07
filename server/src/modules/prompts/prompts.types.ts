export type PromptCategory = 'thumbnail' | 'transcript' | 'meta' | 'image';

export type PromptOutputType = 'text' | 'image' | 'video';

export type SpecificPromptLanguage = 'en' | 'ko' | 'ja' | 'es';
export type PromptLanguage = SpecificPromptLanguage | 'all';
export type CreatePromptLanguage = PromptLanguage;

export interface Prompt {
  id: string;
  key: string;
  language: PromptLanguage;
  name: string;
  category: PromptCategory;
  /** Niche key from niches catalog, or `all` for every niche. */
  niche: string;
  outputType?: PromptOutputType;
  description?: string;
  isSystem?: boolean;
  useReferenceImage?: boolean;
  useChannelBackgroundImage?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromptStep {
  id: string;
  key: string;
  step: number;
  outputType?: PromptOutputType;
  description?: string;
  useReferenceImage?: boolean;
  useChannelBackgroundImage?: boolean;
}

export interface PromptSet {
  id: string;
  baseKey: string;
  language: PromptLanguage;
  name: string;
  category: PromptCategory;
  niche: string;
  isSystem?: boolean;
  createdAt: string;
  updatedAt: string;
  steps: PromptStep[];
}

export interface PromptsStore {
  promptSets: PromptSet[];
}

export interface CreatePromptInput {
  language: CreatePromptLanguage;
  name: string;
  template: string;
  category?: PromptCategory;
  niche?: string;
  outputType?: PromptOutputType;
  description?: string;
  isSystem?: boolean;
  key?: string;
  useReferenceImage?: boolean;
  useChannelBackgroundImage?: boolean;
}

export interface UpdatePromptInput {
  language?: PromptLanguage;
  name?: string;
  template?: string;
  category?: PromptCategory;
  niche?: string;
  outputType?: PromptOutputType;
  description?: string;
  useReferenceImage?: boolean;
  useChannelBackgroundImage?: boolean;
}

export interface PromptResolved extends Prompt {
  template: string;
}
