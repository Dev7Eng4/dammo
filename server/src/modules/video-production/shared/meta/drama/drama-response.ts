import type { LlmBrowserResponse } from '../../../../../infrastructure/llm-browser/llm-browser.types.js';
import { extractJsonText, tryParseMetadataResponse } from '../meta-response.js';
import { DRAMA_NICHE_ID, type MetadataLlmOutput } from '../metadata.types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonObject(response: LlmBrowserResponse): Record<string, unknown> | null {
  const jsonText = extractJsonText(response);
  try {
    const parsed: unknown = JSON.parse(jsonText);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Step 1: segment analysis — require `segment_id`. */
export function tryParseDramaStep1Response(response: LlmBrowserResponse): Record<string, unknown> | null {
  const parsed = parseJsonObject(response);
  if (!parsed) return null;
  if (typeof parsed.segment_id !== 'string' || !parsed.segment_id.trim()) return null;
  return parsed;
}

/** Step 2: merged dossier — require `story_dossier`. */
export function tryParseDramaStep2Response(response: LlmBrowserResponse): Record<string, unknown> | null {
  const parsed = parseJsonObject(response);
  if (!parsed) return null;
  if (!isRecord(parsed.story_dossier)) return null;
  return parsed;
}

/** Step 3: final YouTube metadata package (same niche schema as other meta prompts). */
export function tryParseDramaStep3Response(response: LlmBrowserResponse): MetadataLlmOutput | null {
  return tryParseMetadataResponse(response, { niche: DRAMA_NICHE_ID });
}
