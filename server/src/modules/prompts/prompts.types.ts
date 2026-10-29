export type PromptCategory = 'thumbnail' | 'transcript' | 'meta' | 'image';

export type PromptOutputType = 'text' | 'image' | 'video';

export type SpecificPromptLanguage = 'en' | 'ko' | 'ja' | 'es';
export type PromptLanguage = SpecificPromptLanguage | 'all';
export type CreatePromptLanguage = PromptLanguage;

/** Platform a prompt targets; `all` applies to every platform. */
export type PromptPlatform = 'all' | 'youtube' | 'facebook' | 'tiktok';
export const PROMPT_PLATFORMS: readonly PromptPlatform[] = ['all', 'youtube', 'facebook', 'tiktok'];

export interface Prompt {
  id: string;
  key: string;
  language: PromptLanguage;
  name: string;
  category: PromptCategory;
  /** Niche key from niches catalog, or `all` for every niche. */
  niche: string;
  /** Missing on legacy records; treated as `all`. */
  platform?: PromptPlatform;
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
  platform?: PromptPlatform;
  isSystem?: boolean;
  /**
   * Meta 2-step only: when true, step-2 must include general_background.prompt.
   * When omitted, inferred from the step-2 template containing `general_background`.
   */
  requireGeneralBackground?: boolean;
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
  platform?: PromptPlatform;
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
  platform?: PromptPlatform;
  outputType?: PromptOutputType;
  description?: string;
  useReferenceImage?: boolean;
  useChannelBackgroundImage?: boolean;
}

export interface PromptResolved extends Prompt {
  template: string;
}
