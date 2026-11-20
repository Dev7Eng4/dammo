import { z } from 'zod';
import { LLM_CONTENT_OPTIONS, LLM_IMAGE_OPTIONS, LLM_VIDEO_OPTIONS } from './chrome-profiles.types.js';

export const createChromeProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
});

export const updateChromeProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
});

export const updateChromeProfileLlmsSchema = z.object({
  llmContent: z.array(z.enum(LLM_CONTENT_OPTIONS)).optional(),
  llmImage: z.array(z.enum(LLM_IMAGE_OPTIONS)).optional(),
  llmVideo: z.array(z.enum(LLM_VIDEO_OPTIONS)).optional(),
});
