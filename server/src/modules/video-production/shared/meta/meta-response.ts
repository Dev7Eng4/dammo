import type { LlmBrowserResponse } from '../../../../infrastructure/llm-browser/llm-browser.types.js';
import {
  isCelebrityWisdomNiche,
  type CelebrityWisdomThumbnailSpec,
  type MetadataLlmOutput,
} from './metadata.types.js';

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```[\w]*\n?/gm, '')
    .replace(/\n?```$/gm, '')
    .trim();
}

export function extractJsonText(response: LlmBrowserResponse): string {
  for (let i = response.codeBlocks.length - 1; i >= 0; i -= 1) {
    const block = response.codeBlocks[i].trim();
    if (block.includes('{')) {
      return stripMarkdownFences(block);
    }
  }
  return stripMarkdownFences(response.content);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasRequiredKeys(value: unknown, keys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  return keys.every(key => key in value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function validateStringArrayLength(value: unknown, min: number, max: number): boolean {
  if (!isStringArray(value) || value.length < min || value.length > max) return false;
  return value.every(item => item.trim().length > 0);
}

function validateMetadataFields(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.title !== 'string' || !value.title.trim()) return false;
  if (typeof value.description !== 'string' || !value.description.trim()) return false;
  if (!validateStringArrayLength(value.tags, 1, 10)) return false;
  return true;
}

function pickOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function pickOptionalAlternativeTitles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(title => title.trim())
    .filter(title => title.length > 0);
}

function pickOptionalThumbnail(value: unknown): CelebrityWisdomThumbnailSpec | undefined {
  if (!isRecord(value)) return undefined;
  return value as unknown as CelebrityWisdomThumbnailSpec;
}

/** Prefer `thumbnail.image_generation_prompt` (current niche schema). */
function pickThumbnailImageGenerationPrompt(parsed: Record<string, unknown>): string | undefined {
  if (!isRecord(parsed.thumbnail)) return undefined;
  const raw = pickOptionalTrimmedString(parsed.thumbnail.image_generation_prompt);
  const trimmed = raw?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildBaseMetadataOutput(parsed: Record<string, unknown>): MetadataLlmOutput {
  const metadata = parsed.metadata as Record<string, unknown>;

  const output: MetadataLlmOutput = {
    detected_niche: typeof parsed.detected_niche === 'string' ? parsed.detected_niche.trim() : '',
    metadata: {
      title: String(metadata.title).trim(),
      description: String(metadata.description).trim(),
      tags: (metadata.tags as string[]).map(tag => tag.trim()),
    },
    alternative_titles: pickOptionalAlternativeTitles(parsed.alternative_titles),
  };

  const detectedTopic = pickOptionalTrimmedString(parsed.detected_topic);
  const detectedName = pickOptionalTrimmedString(parsed.detected_name);
  const framing = pickOptionalTrimmedString(parsed.framing);
  const corePromise = pickOptionalTrimmedString(parsed.core_promise);
  if (detectedTopic !== undefined) output.detected_topic = detectedTopic;
  if (detectedName !== undefined) output.detected_name = detectedName;
  if (framing !== undefined) output.framing = framing;
  if (corePromise !== undefined) output.core_promise = corePromise;

  if (typeof parsed.recommended_title_index === 'number' && Number.isFinite(parsed.recommended_title_index)) {
    output.recommended_title_index = parsed.recommended_title_index;
  }

  const thumbnail = pickOptionalThumbnail(parsed.thumbnail);
  if (thumbnail) output.thumbnail = thumbnail;

  const imagePrompt = pickThumbnailImageGenerationPrompt(parsed);
  if (imagePrompt !== undefined) output.image_generation_prompt = imagePrompt;

  const videoVisualPrompt = pickOptionalTrimmedString(parsed.video_visual_prompt);
  if (videoVisualPrompt !== undefined) output.video_visual_prompt = videoVisualPrompt;

  return output;
}

export function tryParseMetadataResponse(response: LlmBrowserResponse, options?: { niche?: string }): MetadataLlmOutput | null {
  const jsonText = extractJsonText(response);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (!hasRequiredKeys(parsed, ['metadata'])) return null;
  if (!validateMetadataFields(parsed.metadata)) return null;

  const niche = options?.niche?.trim() || '';
  // Niche-specific meta prompts must return thumbnail.image_generation_prompt.
  if (niche && niche !== 'all') {
    const imagePrompt = pickThumbnailImageGenerationPrompt(parsed);
    if (!imagePrompt) return null;
    const output = buildBaseMetadataOutput(parsed);
    output.image_generation_prompt = imagePrompt;

    // Niche meta (except celebrity wisdom) must return top-level video_visual_prompt (SI one_image background).
    if (!isCelebrityWisdomNiche(niche) && !output.video_visual_prompt) {
      return null;
    }

    return output;
  }

  return buildBaseMetadataOutput(parsed);
}
