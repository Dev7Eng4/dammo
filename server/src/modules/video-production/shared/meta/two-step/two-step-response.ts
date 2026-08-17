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

function collectStep2FieldIssues(
  parsed: Record<string, unknown>,
  requireGeneralBackground: boolean,
): string[] {
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

  if (requireGeneralBackground) {
    if (!isRecord(parsed.general_background)) {
      missing.push('general_background');
    } else if (!isNonEmptyString(parsed.general_background.prompt)) {
      missing.push('general_background.prompt');
    }
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

function pickDetectedNiche(parsed: Record<string, unknown>): string {
  if (typeof parsed.detected_sub_niche === 'string' && parsed.detected_sub_niche.trim()) {
    return parsed.detected_sub_niche.trim();
  }
  if (typeof parsed.detected_focus === 'string' && parsed.detected_focus.trim()) {
    return parsed.detected_focus.trim();
  }
  if (typeof parsed.detected_niche === 'string' && parsed.detected_niche.trim()) {
    return parsed.detected_niche.trim();
  }
  return '';
}

/** Step 1: niche extraction — any non-empty JSON object. */
export function parseTwoStepStep1Response(
  response: LlmBrowserResponse,
): LlmParseResult<Record<string, unknown>> {
  return parseJsonObjectResult(response);
}

/**
 * Step 2: YouTube metadata package.
 * Always requires metadata + thumbnail.prompt.
 * When requireGeneralBackground, also requires general_background.prompt → video_visual_prompt.
 */
export function parseTwoStepStep2Response(
  response: LlmBrowserResponse,
  requireGeneralBackground: boolean,
): LlmParseResult<MetadataLlmOutput> {
  const jsonResult = parseJsonObjectResult(response);
  if (!jsonResult.ok) return jsonResult;

  const parsed = jsonResult.value;
  const missingFields = collectStep2FieldIssues(parsed, requireGeneralBackground);
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
    detected_niche: pickDetectedNiche(parsed),
    metadata: {
      title: String(metadata.title).trim(),
      description: String(metadata.description).trim(),
      tags: (metadata.tags as string[]).map(tag => tag.trim()),
    },
    alternative_titles: pickOptionalAlternativeTitles(parsed.alternative_titles),
    thumbnail: thumbnail as unknown as MetadataLlmOutput['thumbnail'],
    image_generation_prompt: String(thumbnail.prompt).trim(),
  };

  if (requireGeneralBackground) {
    const generalBackground = parsed.general_background as Record<string, unknown>;
    output.video_visual_prompt = String(generalBackground.prompt).trim();
  }

  return { ok: true, value: output };
}

export function describeTwoStepParseFailure(
  step: 1 | 2,
  response: LlmBrowserResponse,
  requireGeneralBackground: boolean,
): string {
  const result =
    step === 1
      ? parseTwoStepStep1Response(response)
      : parseTwoStepStep2Response(response, requireGeneralBackground);
  if (result.ok) return 'unknown parse failure';
  return formatParseFailureReason(result);
}
