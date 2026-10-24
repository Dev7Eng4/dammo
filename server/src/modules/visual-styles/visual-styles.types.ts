import type { PromptLanguage } from '../prompts/prompts.types.js';

export interface VisualStyle {
  id: string;
  name: string;
  rule: string;
  niche: string;
  language: PromptLanguage;
  createdAt: string;
  updatedAt: string;
}

export interface VisualStylesStore {
  styles: VisualStyle[];
}

export interface CreateVisualStyleInput {
  name: string;
  rule: string;
  niche: string;
  language: PromptLanguage;
}

export interface UpdateVisualStyleInput {
  name?: string;
  rule?: string;
  niche?: string;
  language?: PromptLanguage;
}
