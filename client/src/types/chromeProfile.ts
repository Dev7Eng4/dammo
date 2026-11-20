export const LLM_CONTENT_OPTIONS = ['chatgpt', 'gemini', 'claude'] as const;
export const LLM_IMAGE_OPTIONS = ['meta', 'flow'] as const;
export const LLM_VIDEO_OPTIONS = ['flow'] as const;

export type LlmContent = (typeof LLM_CONTENT_OPTIONS)[number];
export type LlmImage = (typeof LLM_IMAGE_OPTIONS)[number];
export type LlmVideo = (typeof LLM_VIDEO_OPTIONS)[number];
export type ChromeProfileLlmField = 'llmContent' | 'llmImage' | 'llmVideo';

export interface ChromeProfile {
  id: string;
  name: string;
  userDataDir: string;
  createdAt: string;
  /** Flow pick order. Absent when newly added. */
  usageOrder?: number;
  /** LLMs this profile is logged into (absent = none). */
  llmContent?: LlmContent[];
  llmImage?: LlmImage[];
  llmVideo?: LlmVideo[];
}

export interface ChromeProfilesResponse {
  items: ChromeProfile[];
}

export interface CreateChromeProfilePayload {
  name: string;
}

export interface UpdateChromeProfilePayload {
  name: string;
}

/** Replaces the given lists (`[]` clears); omitted keys are left unchanged. */
export interface UpdateChromeProfileLlmsPayload {
  llmContent?: LlmContent[];
  llmImage?: LlmImage[];
  llmVideo?: LlmVideo[];
}

export interface AddChromeProfileFormValues {
  name: string;
}

export interface EditChromeProfileFormValues {
  name: string;
}
