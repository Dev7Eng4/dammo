export type PromptCategory = 'thumbnail' | 'transcript' | 'meta' | 'image';

export type PromptOutputType = 'text' | 'image' | 'video';

export type PromptLanguage = 'en' | 'ko' | 'ja' | 'es';

/** Create form / API: replicate prompt for every language. */
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

  useChannelBackgroundImage?: boolean;

  createdAt: string;

  updatedAt: string;

}

export interface ThumbnailStyleOption {
  key: string;
  name: string;
  useChannelBackgroundImage: boolean;
}



export interface PromptResolved extends Prompt {

  template: string;

}



export interface CreatePromptPayload {

  language: CreatePromptLanguage;

  name: string;

  template: string;

  category?: PromptCategory;

  outputType?: PromptOutputType;

  description?: string;

  useReferenceImage?: boolean;

  useChannelBackgroundImage?: boolean;

}



export interface UpdatePromptPayload {

  language?: PromptLanguage;

  name?: string;

  template?: string;

  category?: PromptCategory;

  outputType?: PromptOutputType;

  description?: string;

  useReferenceImage?: boolean;

  useChannelBackgroundImage?: boolean;

}



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

  outputType: PromptOutputType;

  description: string;

  template: string;

  templateParams: string[];

  isSystem?: boolean;

  useReferenceImage: boolean;

  useChannelBackgroundImage: boolean;

}

