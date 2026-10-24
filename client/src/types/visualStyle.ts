import type { PromptLanguage } from './prompt';

export interface VisualStyle {
  id: string;
  name: string;
  rule: string;
  niche: string;
  language: PromptLanguage;
  createdAt: string;
  updatedAt: string;
}

export interface VisualStylesResponse {
  items: VisualStyle[];
}

export interface VisualStyleFormValues {
  name: string;
  rule: string;
  niche: string;
  language: PromptLanguage;
}

export interface CreateVisualStylePayload {
  name: string;
  rule: string;
  niche: string;
  language: PromptLanguage;
}

export interface UpdateVisualStylePayload {
  name?: string;
  rule?: string;
  niche?: string;
  language?: PromptLanguage;
}
