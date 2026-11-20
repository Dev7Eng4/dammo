import type { LlmBrowserResponse } from '../../../llm-browser/core/types.js';
import {
  extractJsonText,
  formatParseFailureReason,
  snippetFromResponse,
  truncateSnippet,
  type LlmParseResult,
} from './llm-parse-result.js';
import {
  isCelebrityWisdomNiche,
  isSeniorHealthNiche,
  pickClusterFormatChoice,
  type CelebrityWisdomThumbnailSpec,
  type MetadataLlmOutput,
} from './metadata.types.js';

export { extractJsonText } from './llm-parse-result.js';

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

/** Tags must be a non-empty string array; count is not capped. */
function hasNonEmptyTags(value: unknown): boolean {
  if (!isStringArray(value) || value.length < 1) return false;
  return value.every(item => item.trim().length > 0);
}

function collectMetadataFieldIssues(value: unknown): string[] {
  if (!isRecord(value)) return ['metadata'];
  const missing: string[] = [];
  if (typeof value.title !== 'string' || !value.title.trim()) missing.push('metadata.title');
  if (typeof value.description !== 'string' || !value.description.trim()) missing.push('metadata.description');
  if (!hasNonEmptyTags(value.tags)) missing.push('metadata.tags');
  return missing;
}

function validateMetadataFields(value: unknown): boolean {
  return collectMetadataFieldIssues(value).length === 0;
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

/** Prefer `thumbnail.prompt`, fallback `thumbnail.image_generation_prompt` (legacy niche schema). */
function pickThumbnailImageGenerationPrompt(parsed: Record<string, unknown>): string | undefined {
  if (!isRecord(parsed.thumbnail)) return undefined;
  const fromPrompt = pickOptionalTrimmedString(parsed.thumbnail.prompt);
  if (fromPrompt) return fromPrompt;
  const fromLegacy = pickOptionalTrimmedString(parsed.thumbnail.image_generation_prompt);
  return fromLegacy;
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

  // Models sometimes close the `thumbnail` object one brace too late, nesting video_visual_prompt inside it.
  const nestedThumbnail =
    parsed.thumbnail && typeof parsed.thumbnail === 'object' && !Array.isArray(parsed.thumbnail)
      ? (parsed.thumbnail as Record<string, unknown>)
      : undefined;
  const videoVisualPrompt =
    pickOptionalTrimmedString(parsed.video_visual_prompt) ??
    pickOptionalTrimmedString(nestedThumbnail?.video_visual_prompt);
  if (videoVisualPrompt !== undefined) output.video_visual_prompt = videoVisualPrompt;

  const clusterFormat = pickClusterFormatChoice(parsed.cluster_format);
  if (clusterFormat) output.cluster_format = clusterFormat;

  return output;
}

/**
 * Escape double quotes that sit inside a JSON string value: a quote only closes the string when the next
 * non-space character can follow a string (`,` `}` `]` `:` or the end). Used only after JSON.parse failed.
 */
export function escapeStrayQuotes(jsonText: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < jsonText.length; i += 1) {
    const char = jsonText[i];
    if (!inString) {
      if (char === '"') inString = true;
      out += char;
      continue;
    }
    if (char === '\\') {
      out += char + (jsonText[i + 1] ?? '');
      i += 1;
      continue;
    }
    if (char === '"') {
      let j = i + 1;
      while (j < jsonText.length && /\s/.test(jsonText[j])) j += 1;
      const next = jsonText[j];
      if (next === undefined || next === ',' || next === '}' || next === ']' || next === ':') {
        inString = false;
        out += char;
      } else {
        out += '\\"';
      }
      continue;
    }
    out += char;
  }
  return out;
}

export function parseMetadataResponse(
  response: LlmBrowserResponse,
  options?: { niche?: string },
): LlmParseResult<MetadataLlmOutput> {
  const jsonText = extractJsonText(response);
  const snippet = snippetFromResponse(response);

  if (!jsonText.trim()) {
    return { ok: false, reason: 'no JSON found in response', snippet };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    // Models often quote words inside a string value without escaping ("text '"怒った"' in white"): repair once.
    try {
      parsed = JSON.parse(escapeStrayQuotes(jsonText));
    } catch {
      const message = err instanceof Error ? err.message : 'JSON.parse failed';
      return { ok: false, reason: `invalid JSON (${message})`, snippet: truncateSnippet(jsonText) };
    }
  }

  if (!isRecord(parsed)) {
    return { ok: false, reason: 'JSON root is not an object', snippet };
  }

  if (!hasRequiredKeys(parsed, ['metadata'])) {
    return {
      ok: false,
      reason: 'missing required fields',
      missingFields: ['metadata'],
      snippet,
    };
  }

  const metadataIssues = collectMetadataFieldIssues(parsed.metadata);
  if (metadataIssues.length > 0) {
    return {
      ok: false,
      reason: 'metadata schema mismatch',
      missingFields: metadataIssues,
      snippet,
    };
  }

  const niche = options?.niche?.trim() || '';
  if (niche && niche !== 'all') {
    const imagePrompt = pickThumbnailImageGenerationPrompt(parsed);
    if (!imagePrompt) {
      return {
        ok: false,
        reason: 'missing required fields',
        missingFields: [
          isCelebrityWisdomNiche(niche) ? 'thumbnail.prompt' : 'thumbnail.image_generation_prompt',
        ],
        snippet,
      };
    }

    const output = buildBaseMetadataOutput(parsed);
    output.image_generation_prompt = imagePrompt;

    if (!isCelebrityWisdomNiche(niche) && !isSeniorHealthNiche(niche) && !output.video_visual_prompt) {
      return {
        ok: false,
        reason: 'missing required fields',
        missingFields: ['video_visual_prompt'],
        snippet,
      };
    }

    return { ok: true, value: output };
  }

  return { ok: true, value: buildBaseMetadataOutput(parsed) };
}

export function tryParseMetadataResponse(
  response: LlmBrowserResponse,
  options?: { niche?: string },
): MetadataLlmOutput | null {
  const result = parseMetadataResponse(response, options);
  return result.ok ? result.value : null;
}

export function describeMetadataParseFailure(
  response: LlmBrowserResponse,
  options?: { niche?: string },
): string {
  const result = parseMetadataResponse(response, options);
  if (result.ok) return 'unknown parse failure';
  return formatParseFailureReason(result);
}
