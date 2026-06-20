export type PromptCategory = 'thumbnail' | 'transcript' | 'meta' | 'image';



export type PromptLanguage = 'en' | 'ko' | 'ja' | 'es';



export type PlaygroundProvider = 'gpt' | 'gemini';

export type ImageBrowserProvider = 'flow';

export interface PromptsSettings {
  defaultLlmProvider: PlaygroundProvider;
  defaultImageProvider: ImageBrowserProvider;
}

export interface UpdatePromptsSettingsPayload {
  defaultLlmProvider?: PlaygroundProvider;
  defaultImageProvider?: ImageBrowserProvider;
}

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



export interface PromptResolved extends Prompt {

  template: string;

}



export interface CreatePromptPayload {

  key: string;

  language: PromptLanguage;

  name: string;

  template: string;

  category?: PromptCategory;

  description?: string;

}



export interface UpdatePromptPayload {

  key?: string;

  language?: PromptLanguage;

  name?: string;

  template?: string;

  category?: PromptCategory;

  description?: string;

}



export interface PromptPlaygroundRunPayload {

  provider: PlaygroundProvider;

  userPrompt: string;

  promptId?: string;

}



export interface PromptPlaygroundUsage {

  promptTokens: number;

  completionTokens: number;

  totalTokens: number;

}



export interface PromptPlaygroundResult {

  content: string;

  provider: PlaygroundProvider;

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

  description: string;

  template: string;

  templateParams: string[];

  systemPrompt: string;

  outputSchema: string;

}

