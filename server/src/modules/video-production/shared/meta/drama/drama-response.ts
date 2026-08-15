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

function validateStringArrayLength(value: unknown, min: number, max: number): boolean {
  if (!isStringArray(value) || value.length < min || value.length > max) return false;
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
    if (Object.keys(parsed).length === 0) {
      return { ok: false, reason: 'empty JSON object', snippet: truncateSnippet(jsonText) };
    }
    return { ok: true, value: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'JSON.parse failed';
    return { ok: false, reason: `invalid JSON (${message})`, snippet: truncateSnippet(jsonText) };
  }
}

function collectDramaStep2FieldIssues(parsed: Record<string, unknown>): string[] {
  const missing: string[] = [];

  if (!isRecord(parsed.metadata)) {
    missing.push('metadata');
  } else {
    if (!isNonEmptyString(parsed.metadata.title)) missing.push('metadata.title');
    if (!isNonEmptyString(parsed.metadata.description)) missing.push('metadata.description');
    if (!validateStringArrayLength(parsed.metadata.tags, 1, 10)) missing.push('metadata.tags');
  }

  if (!isRecord(parsed.thumbnail)) {
    missing.push('thumbnail');
  } else if (!isNonEmptyString(parsed.thumbnail.prompt)) {
    missing.push('thumbnail.prompt');
  }

  if (!isRecord(parsed.general_background)) {
    missing.push('general_background');
  } else if (!isNonEmptyString(parsed.general_background.prompt)) {
    missing.push('general_background.prompt');
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

/** Step 1: story extraction — any non-empty JSON object. */
export function parseDramaStep1Response(response: LlmBrowserResponse): LlmParseResult<Record<string, unknown>> {
  return parseJsonObjectResult(response);
}

export function tryParseDramaStep1Response(response: LlmBrowserResponse): Record<string, unknown> | null {
  const result = parseDramaStep1Response(response);
  return result.ok ? result.value : null;
}

/**
 * Step 2: final YouTube metadata package.
 * Requires metadata + thumbnail.prompt + general_background.prompt,
 * then maps prompts onto the canonical image_generation_prompt / video_visual_prompt fields.
 */
export function parseDramaStep2Response(response: LlmBrowserResponse): LlmParseResult<MetadataLlmOutput> {
  const jsonResult = parseJsonObjectResult(response);
  if (!jsonResult.ok) return jsonResult;

  const parsed = jsonResult.value;
  const missingFields = collectDramaStep2FieldIssues(parsed);
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
  const generalBackground = parsed.general_background as Record<string, unknown>;

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
    video_visual_prompt: String(generalBackground.prompt).trim(),
  };

  return { ok: true, value: output };
}

export function tryParseDramaStep2Response(response: LlmBrowserResponse): MetadataLlmOutput | null {
  const result = parseDramaStep2Response(response);
  return result.ok ? result.value : null;
}

export function describeDramaParseFailure(step: 1 | 2, response: LlmBrowserResponse): string {
  const result = step === 1 ? parseDramaStep1Response(response) : parseDramaStep2Response(response);
  if (result.ok) return 'unknown parse failure';
  return formatParseFailureReason(result);
}

export function dramaParseFailureDetails(step: 1 | 2, response: LlmBrowserResponse) {
  const result = step === 1 ? parseDramaStep1Response(response) : parseDramaStep2Response(response);
  if (result.ok) return undefined;
  return {
    reason: result.reason,
    missingFields: result.missingFields,
    snippet: result.snippet,
  };
}
