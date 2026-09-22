import type { LlmBrowserResponse } from '../../../../../infrastructure/llm-browser/llm-browser.types.js';
import {
  extractJsonText,
  formatParseFailureReason,
  snippetFromResponse,
  truncateSnippet,
  type LlmParseResult,
} from '../llm-parse-result.js';
import type { MetadataLlmOutput } from '../metadata.types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/** Tags must be a non-empty string array; count is not capped. */
function hasNonEmptyTags(value: unknown): boolean {
  if (!isStringArray(value) || value.length < 1) return false;
  return value.every(item => item.trim().length > 0);
}

function parseJsonObjectResult(response: LlmBrowserResponse): LlmParseResult<Record<string, unknown>> {
  const jsonText = extractJsonText(response);
  const snippet = snippetFromResponse(response);

  if (!jsonText.trim()) {
    return { ok: false, reason: 'no JSON found in response', snippet };
  }

  try {
    const parsed: unknown = JSON.parse(jsonText);
    if (!isRecord(parsed)) {
      return { ok: false, reason: 'JSON root is not an object', snippet: truncateSnippet(jsonText) };
    }
    return { ok: true, value: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'JSON.parse failed';
    return { ok: false, reason: `invalid JSON (${message})`, snippet: truncateSnippet(jsonText) };
  }
}

function collectStep2FieldIssues(parsed: Record<string, unknown>): string[] {
  const missing: string[] = [];

  if (!isRecord(parsed.metadata)) {
    missing.push('metadata');
  } else {
    if (!isNonEmptyString(parsed.metadata.title)) missing.push('metadata.title');
    if (!isNonEmptyString(parsed.metadata.description)) missing.push('metadata.description');
    if (!hasNonEmptyTags(parsed.metadata.tags)) missing.push('metadata.tags');
  }

  if (!isRecord(parsed.thumbnail)) {
    missing.push('thumbnail');
  } else if (!isNonEmptyString(parsed.thumbnail.prompt)) {
    missing.push('thumbnail.prompt');
  }

  return missing;
}

function pickOptionalAlternativeTitles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(title => title.trim())
    .filter(title => title.length > 0);
}

/** Step 1: content analysis — any parseable JSON object. */
export function parseCelebrityWisdomStep1Response(
  response: LlmBrowserResponse,
): LlmParseResult<Record<string, unknown>> {
  return parseJsonObjectResult(response);
}

/**
 * Step 2: YouTube packaging.
 * Requires metadata + thumbnail.prompt; maps thumbnail.prompt → image_generation_prompt.
 * Does not require general_background / video_visual_prompt.
 */
export function parseCelebrityWisdomStep2Response(
  response: LlmBrowserResponse,
): LlmParseResult<MetadataLlmOutput> {
  const jsonResult = parseJsonObjectResult(response);
  if (!jsonResult.ok) return jsonResult;

  const parsed = jsonResult.value;
  const missingFields = collectStep2FieldIssues(parsed);
  if (missingFields.length > 0) {
    return {
      ok: false,
      reason: 'missing required fields',
      missingFields,
      snippet: snippetFromResponse(response),
    };
  }

  const metadata = parsed.metadata as Record<string, unknown>;
  const thumbnail = parsed.thumbnail as Record<string, unknown>;

  const output: MetadataLlmOutput = {
    detected_niche: typeof parsed.detected_niche === 'string' ? parsed.detected_niche.trim() : '',
    metadata: {
      title: String(metadata.title).trim(),
      description: String(metadata.description).trim(),
      tags: (metadata.tags as string[]).map(tag => tag.trim()),
    },
    alternative_titles: pickOptionalAlternativeTitles(parsed.alternative_titles),
    thumbnail: thumbnail as unknown as MetadataLlmOutput['thumbnail'],
    image_generation_prompt: String(thumbnail.prompt).trim(),
  };

  return { ok: true, value: output };
}

export function describeCelebrityWisdomParseFailure(step: 1 | 2, response: LlmBrowserResponse): string {
  const result =
    step === 1 ? parseCelebrityWisdomStep1Response(response) : parseCelebrityWisdomStep2Response(response);
  if (result.ok) return 'unknown parse failure';
  return formatParseFailureReason(result);
}
