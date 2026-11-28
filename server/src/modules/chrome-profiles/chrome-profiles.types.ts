/** LLMs a profile is logged into, per capability. */
export const LLM_CONTENT_OPTIONS = ['chatgpt', 'gemini', 'claude'] as const;
export const LLM_IMAGE_OPTIONS = ['meta', 'flow', 'muse'] as const;
export const LLM_VIDEO_OPTIONS = ['flow', 'muse'] as const;

export type LlmContent = (typeof LLM_CONTENT_OPTIONS)[number];
export type LlmImage = (typeof LLM_IMAGE_OPTIONS)[number];
export type LlmVideo = (typeof LLM_VIDEO_OPTIONS)[number];

/** What a profile is used for: chat/text, image generation, or video generation. */
export type LlmCapability = 'content' | 'image' | 'video';

/** LLM ids valid for each capability. */
export interface LlmByCapability {
  content: LlmContent;
  image: LlmImage;
  video: LlmVideo;
}

export interface ChromeProfile {
  id: string;
  name: string;
  userDataDir: string;
  createdAt: string;
  /** Flow pick order. Absent when newly added. Higher = preferred among numbered. */
  usageOrder?: number;
  /** Chat/text LLMs this profile is logged into. Absent = none. */
  llmContent?: LlmContent[];
  /** Image LLMs this profile is logged into. Absent = none. */
  llmImage?: LlmImage[];
  /** Video LLMs this profile is logged into. Absent = none. */
  llmVideo?: LlmVideo[];
}

export interface ChromeProfilesStore {
  profiles: ChromeProfile[];
}

export interface CreateChromeProfileInput {
  name: string;
}

export interface UpdateChromeProfileInput {
  name: string;
}

/** Replaces the given lists (`[]` clears); omitted keys are left unchanged. */
export interface UpdateChromeProfileLlmsInput {
  llmContent?: LlmContent[];
  llmImage?: LlmImage[];
  llmVideo?: LlmVideo[];
}
