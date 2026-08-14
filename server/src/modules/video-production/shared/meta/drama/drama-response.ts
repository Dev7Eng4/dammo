import type { LlmBrowserResponse } from '../../../../../infrastructure/llm-browser/llm-browser.types.js';
import {
  extractJsonText,
  formatParseFailureReason,
  snippetFromResponse,
  truncateSnippet,
  type LlmParseResult,
} from '../llm-parse-result.js';
import { parseMetadataResponse } from '../meta-response.js';
import { DRAMA_NICHE_ID, type MetadataLlmOutput } from '../metadata.types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

/** Step 1: segment analysis — shallow outer-object check only. */
export function parseDramaStep1Response(response: LlmBrowserResponse): LlmParseResult<Record<string, unknown>> {
  return parseJsonObjectResult(response);
}

export function tryParseDramaStep1Response(response: LlmBrowserResponse): Record<string, unknown> | null {
  const result = parseDramaStep1Response(response);
  return result.ok ? result.value : null;
}

/** Step 2: merged dossier — shallow outer-object check only. */
export function parseDramaStep2Response(response: LlmBrowserResponse): LlmParseResult<Record<string, unknown>> {
  return parseJsonObjectResult(response);
}

export function tryParseDramaStep2Response(response: LlmBrowserResponse): Record<string, unknown> | null {
  const result = parseDramaStep2Response(response);
  return result.ok ? result.value : null;
}

/** Step 3: final YouTube metadata package (same niche schema as other meta prompts). */
export function parseDramaStep3Response(response: LlmBrowserResponse): LlmParseResult<MetadataLlmOutput> {
  return parseMetadataResponse(response, { niche: DRAMA_NICHE_ID });
}

export function tryParseDramaStep3Response(response: LlmBrowserResponse): MetadataLlmOutput | null {
  const result = parseDramaStep3Response(response);
  return result.ok ? result.value : null;
}

export function describeDramaParseFailure(step: 1 | 2 | 3, response: LlmBrowserResponse): string {
  const result =
    step === 1
      ? parseDramaStep1Response(response)
      : step === 2
        ? parseDramaStep2Response(response)
        : parseDramaStep3Response(response);
  if (result.ok) return 'unknown parse failure';
  return formatParseFailureReason(result);
}

export function dramaParseFailureDetails(step: 1 | 2 | 3, response: LlmBrowserResponse) {
  const result =
    step === 1
      ? parseDramaStep1Response(response)
      : step === 2
        ? parseDramaStep2Response(response)
        : parseDramaStep3Response(response);
  if (result.ok) return undefined;
  return {
    reason: result.reason,
    missingFields: result.missingFields,
    snippet: result.snippet,
  };
}
