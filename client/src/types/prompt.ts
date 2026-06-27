export type PromptCategory = 'thumbnail' | 'transcript' | 'meta' | 'image';

export type PromptOutputType = 'text' | 'image';

export type PromptLanguage = 'en' | 'ko' | 'ja' | 'es';



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

  createdAt: string;

  updatedAt: string;

}

export interface ThumbnailStyleOption {
  key: string;
  name: string;
}



export interface PromptResolved extends Prompt {

  template: string;

}



export interface CreatePromptPayload {

  key: string;

  language: PromptLanguage;

  name: string;

  template: string;

  category?: PromptCategory;

  outputType?: PromptOutputType;

  description?: string;

}



export interface UpdatePromptPayload {

  key?: string;

  language?: PromptLanguage;

  name?: string;

  template?: string;

  category?: PromptCategory;

  outputType?: PromptOutputType;

  description?: string;

}



export interface PromptPlaygroundRunPayload {
  outputType?: PromptOutputType;

  provider?: PlaygroundProvider;

  imageProvider?: ImageBrowserProvider;

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

  provider: PlaygroundProvider | ImageBrowserProvider;

  profileId?: string;

  codeBlocks?: string[];

  elapsedMs: number;

  model?: string;

  usage?: PromptPlaygroundUsage;

}



export interface PromptFormDraft {

  id: string | null;

  key: string;

  language: PromptLanguage;

  name: string;

  category: PromptCategory;

  outputType: PromptOutputType;

  description: string;

  template: string;

  templateParams: string[];

  systemPrompt: string;

  outputSchema: string;

}

