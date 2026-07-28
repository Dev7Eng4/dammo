export type PromptCategory = 'thumbnail' | 'transcript' | 'meta' | 'image';

export type PromptOutputType = 'text' | 'image' | 'video';

export type PromptLanguage = 'en' | 'ko' | 'ja' | 'es';

export type CreatePromptLanguage = PromptLanguage | 'all';

export const PROMPT_LANGUAGES: PromptLanguage[] = ['en', 'ko', 'ja', 'es'];

export type PlaygroundProvider = 'gpt' | 'gemini';

export type ImageBrowserProvider = 'flow' | 'meta';

export type VideoBrowserProvider = 'meta';

export interface PromptsSettings {
  defaultLlmProvider: PlaygroundProvider;
  defaultImageProvider: ImageBrowserProvider;
  defaultVideoProvider: VideoBrowserProvider;
}

export interface UpdatePromptsSettingsPayload {
  defaultLlmProvider?: PlaygroundProvider;
  defaultImageProvider?: ImageBrowserProvider;
  defaultVideoProvider?: VideoBrowserProvider;
}

export interface PromptStep {
  id: string;
  order: number;
  name?: string;
  outputType: PromptOutputType;
  useReferenceImage?: boolean;
  useChannelBackgroundImage?: boolean;
  templateParams: string[];
  outputSchema?: Record<string, unknown>;
}

export interface PromptSet {
  id: string;
  key: string;
  language: PromptLanguage;
  name: string;
  category: PromptCategory;
  description?: string;
  isDefault?: boolean;
  isSystem?: boolean;
  steps: PromptStep[];
  createdAt: string;
  updatedAt: string;
}

/** @deprecated Use PromptSet */
export type Prompt = PromptSet & {
  outputType?: PromptOutputType;
  useReferenceImage?: boolean;
  useChannelBackgroundImage?: boolean;
  template?: string;
};

export interface ThumbnailStyleOption {
  key: string;
  name: string;
  useChannelBackgroundImage: boolean;
}

export interface PromptSetOption {
  id: string;
  name: string;
  key: string;
  isDefault: boolean;
  stepCount: number;
  useChannelBackgroundImage?: boolean;
}

export interface PromptSetResolved extends PromptSet {
  stepsWithTemplates: Array<PromptStep & { template: string }>;
  /** Legacy first-step template for older clients */
  template?: string;
}

/** @deprecated */
export type PromptResolved = PromptSetResolved;

export interface PromptStepFormValues {
  id: string;
  order: number;
  name: string;
  outputType: PromptOutputType;
  useReferenceImage: boolean;
  useChannelBackgroundImage: boolean;
  templateParams: string[];
  outputSchemaText: string;
  template: string;
}

export interface CreatePromptSetPayload {
  language: CreatePromptLanguage;
  name: string;
  category?: PromptCategory;
  description?: string;
  isDefault?: boolean;
  steps: Array<{
    id?: string;
    order?: number;
    name?: string;
    outputType?: PromptOutputType;
    useReferenceImage?: boolean;
    useChannelBackgroundImage?: boolean;
    templateParams?: string[];
    outputSchema?: Record<string, unknown>;
    template: string;
  }>;
}

export interface UpdatePromptSetPayload {
  language?: PromptLanguage;
  name?: string;
  category?: PromptCategory;
  description?: string;
  isDefault?: boolean;
  steps?: CreatePromptSetPayload['steps'];
}

/** @deprecated */
export type CreatePromptPayload = CreatePromptSetPayload;
/** @deprecated */
export type UpdatePromptPayload = UpdatePromptSetPayload;

export interface PromptPlaygroundRunPayload {
  outputType?: PromptOutputType;
  provider?: PlaygroundProvider;
  imageProvider?: ImageBrowserProvider;
  videoProvider?: VideoBrowserProvider;
  userPrompt: string;
  promptId?: string;
}

export interface PromptPlaygroundUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface PromptPlaygroundResult {
  kind: PromptOutputType;
  content: string;
  imageBase64?: string;
  imageMimeType?: string;
  videoBase64?: string;
  videoMimeType?: string;
  provider: PlaygroundProvider | ImageBrowserProvider | VideoBrowserProvider;
  profileId?: string;
  codeBlocks?: string[];
  elapsedMs: number;
  model?: string;
  usage?: PromptPlaygroundUsage;
}

export interface PromptFormDraft {
  id: string | null;
  key: string;
  language: CreatePromptLanguage;
  name: string;
  category: PromptCategory;
  description: string;
  isDefault: boolean;
  isSystem?: boolean;
  steps: PromptStepFormValues[];
  /** Index of step currently edited / playground */
  activeStepIndex: number;
}

export type ChannelPromptSetIds = {
  transcript?: string;
  meta?: string;
  thumbnail?: string;
  image?: string;
};
