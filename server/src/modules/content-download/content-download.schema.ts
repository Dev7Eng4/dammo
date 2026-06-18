import { z } from 'zod';
import { DEFAULT_TRANSCRIPT_LANGUAGE } from '../../infrastructure/youtube/youtube-transcript-downloader.js';

export const downloadYoutubeUrlSchema = z.object({
  url: z.string().min(1),
});

export const downloadYoutubeTranscriptSchema = z.object({
  url: z.string().min(1),
  language: z.enum(['en', 'ko', 'ja', 'es']).default(DEFAULT_TRANSCRIPT_LANGUAGE),
});
