export type PromptCategory = 'thumbnail' | 'transcript' | 'meta' | 'image';

export type PromptOutputType = 'text' | 'image' | 'video';

export type PromptLanguage = 'en' | 'ko' | 'ja' | 'es';

/** Create-only: replicate set for every language. */
export type CreatePromptLanguage = PromptLanguage | 'all';

export interface PromptStep {
  id: string;
  order: number;
  name?: string;
  outputType: PromptOutputType;
  useReferenceImage?: boolean;
  useChannelBackgroundImage?: boolean;
  templateParams: string[];
  /** JSON Schema object describing LLM output (text steps). */
  outputSchema?: Record<string, unknown>;
}

export interface PromptSet {
  id: string;
  key: string;
  name: string;
  language: PromptLanguage;
  category: PromptCategory;
  description?: string;
  isDefault?: boolean;
  isSystem?: boolean;
  steps: PromptStep[];
  createdAt: string;
  updatedAt: string;
}

export interface PromptsStore {
  promptSets: PromptSet[];
  /** @deprecated Legacy flat prompts — migrated on load */
  prompts?: unknown[];
}

export interface PromptStepInput {
  id?: string;
  order?: number;
  name?: string;
  outputType?: PromptOutputType;
  useReferenceImage?: boolean;
  useChannelBackgroundImage?: boolean;
  templateParams?: string[];
  outputSchema?: Record<string, unknown>;
  /** Template body for this step (required on create). */
  template: string;
}

export interface CreatePromptSetInput {
  language: CreatePromptLanguage;
  name: string;
  category?: PromptCategory;
  description?: string;
  isDefault?: boolean;
  key?: string;
  steps: PromptStepInput[];
}

export interface UpdatePromptSetInput {
  language?: PromptLanguage;
  name?: string;
  category?: PromptCategory;
  description?: string;
  isDefault?: boolean;
  steps?: PromptStepInput[];
}

export interface PromptSetResolved extends PromptSet {
  stepsWithTemplates: Array<PromptStep & { template: string }>;
}

export interface PromptSetOption {
  id: string;
  name: string;
  key: string;
  isDefault: boolean;
  stepCount: number;
  useChannelBackgroundImage?: boolean;
}

/** Channel override map (PromptSet.id per category). */
export type ChannelPromptSetIds = {
  transcript?: string;
  meta?: string;
  thumbnail?: string;
  image?: string;
};

// --- Legacy aliases (migration / gradual callers) ---

/** @deprecated Use PromptSet */
export type Prompt = PromptSet & {
  outputType?: PromptOutputType;
  useReferenceImage?: boolean;
  useChannelBackgroundImage?: boolean;
};

/** @deprecated */
export interface CreatePromptInput {
  language: CreatePromptLanguage;
  name: string;
  template: string;
  category?: PromptCategory;
  outputType?: PromptOutputType;
  description?: string;
  isSystem?: boolean;
  key?: string;
  useReferenceImage?: boolean;
  useChannelBackgroundImage?: boolean;
}

/** @deprecated */
export interface UpdatePromptInput {
  language?: PromptLanguage;
  name?: string;
  template?: string;
  category?: PromptCategory;
  outputType?: PromptOutputType;
  description?: string;
  useReferenceImage?: boolean;
  useChannelBackgroundImage?: boolean;
}

/** @deprecated Use PromptSetResolved */
export interface PromptResolved extends Prompt {
  template: string;
}
