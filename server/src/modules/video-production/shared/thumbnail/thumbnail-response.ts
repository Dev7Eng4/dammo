import type { LlmBrowserResponse } from '../../../../infrastructure/llm-browser/llm-browser.types.js';
import {
  extractJsonText,
  formatParseFailureReason,
  snippetFromResponse,
  truncateSnippet,
  type LlmParseResult,
} from '../meta/llm-parse-result.js';
import type {
  ThumbnailHorizontalCopy,
  ThumbnailHorizontalStep1Output,
  ThumbnailHorizontalStep2Output,
  ThumbnailHorizontalStep3Output,
} from './thumbnail.types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasRequiredKeys(value: unknown, keys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  return keys.every(key => key in value);
}

function missingRequiredKeys(value: unknown, keys: readonly string[], prefix = ''): string[] {
  if (!isRecord(value)) return prefix ? [prefix] : ['(root)'];
  return keys.filter(key => !(key in value)).map(key => (prefix ? `${prefix}.${key}` : key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateThumbnailCharacter(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.role) &&
    isNonEmptyString(value.appearance) &&
    isNonEmptyString(value.expression) &&
    isNonEmptyString(value.pose)
  );
}

function validateThumbnailCopy(value: unknown): value is ThumbnailHorizontalCopy {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.line_1) &&
    isNonEmptyString(value.line_2) &&
    isNonEmptyString(value.line_3) &&
    isNonEmptyString(value.twist_line)
  );
}

const STEP1_REQUIRED_KEYS = [
  'detected_niche',
  'sub_niche',
  'dominant_emotion',
  'secondary_emotion',
  'core_conflict',
  'clickable_reveal',
  'best_thumbnail_moment',
  'evidence_object',
  'setting',
  'characters',
  'visual_tone',
  'visual_scene',
  'safe_visual_description',
  'ctr_reasoning',
  'thumbnail_angle',
  'risk_flags',
  'safety_notes',
] as const;

function collectStep1NestedMissing(value: Record<string, unknown>): string[] {
  const missing: string[] = [];
  if (!isRecord(value.characters)) {
    missing.push('characters');
  } else {
    if (!validateThumbnailCharacter(value.characters.character_1)) missing.push('characters.character_1');
    if (!validateThumbnailCharacter(value.characters.character_2)) missing.push('characters.character_2');
  }
  missing.push(
    ...missingRequiredKeys(value.ctr_reasoning, [
      'why_this_moment_is_clickable',
      'what_viewer_will_wonder',
      'main_curiosity_gap',
    ], 'ctr_reasoning'),
  );
  missing.push(
    ...missingRequiredKeys(value.thumbnail_angle, [
      'line_1_concept',
      'line_2_concept',
      'line_3_concept',
      'twist_line_concept',
    ], 'thumbnail_angle'),
  );
  missing.push(
    ...missingRequiredKeys(
      value.risk_flags,
      [
        'real_person_risk',
        'minor_risk',
        'explicit_sexual_content_risk',
        'graphic_violence_risk',
        'copyright_or_logo_risk',
        'defamation_risk',
      ],
      'risk_flags',
    ),
  );
  if (!isNonEmptyString(value.safety_notes)) missing.push('safety_notes');
  return missing;
}

function parseJsonRoot(response: LlmBrowserResponse): LlmParseResult<Record<string, unknown>> {
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

export function parseThumbnailHorizontalStep1Response(
  response: LlmBrowserResponse,
): LlmParseResult<ThumbnailHorizontalStep1Output> {
  const root = parseJsonRoot(response);
  if (!root.ok) return root;

  const missingTop = missingRequiredKeys(root.value, STEP1_REQUIRED_KEYS);
  if (missingTop.length > 0) {
    return {
      ok: false,
      reason: 'missing required fields',
      missingFields: missingTop,
      snippet: root.ok ? snippetFromResponse(response) : undefined,
    };
  }

  const nestedMissing = collectStep1NestedMissing(root.value);
  if (nestedMissing.length > 0) {
    return {
      ok: false,
      reason: 'schema mismatch',
      missingFields: nestedMissing,
      snippet: snippetFromResponse(response),
    };
  }

  return { ok: true, value: root.value as unknown as ThumbnailHorizontalStep1Output };
}

export function tryParseThumbnailHorizontalStep1Response(
  response: LlmBrowserResponse,
): ThumbnailHorizontalStep1Output | null {
  const result = parseThumbnailHorizontalStep1Response(response);
  return result.ok ? result.value : null;
}

const STEP2_REQUIRED_KEYS = ['thumbnail_copy', 'copy_intent', 'length_check', 'safety_check'] as const;

function collectStep2NestedMissing(value: Record<string, unknown>): string[] {
  const missing: string[] = [];
  if (!validateThumbnailCopy(value.thumbnail_copy)) missing.push('thumbnail_copy');
  missing.push(
    ...missingRequiredKeys(value.copy_intent, ['line_1_role', 'line_2_role', 'line_3_role', 'twist_line_role'], 'copy_intent'),
  );
  missing.push(
    ...missingRequiredKeys(
      value.length_check,
      [
        'line_1_visual_length',
        'line_2_visual_length',
        'line_3_visual_length',
        'twist_line_visual_length',
        'top_lines_balanced',
      ],
      'length_check',
    ),
  );
  missing.push(
    ...missingRequiredKeys(
      value.safety_check,
      ['no_explicit_sexual_wording', 'no_real_person_claim', 'no_copyrighted_reference', 'no_unsupported_fact'],
      'safety_check',
    ),
  );
  const lengthCheck = value.length_check;
  if (isRecord(lengthCheck) && typeof lengthCheck.top_lines_balanced !== 'boolean') {
    missing.push('length_check.top_lines_balanced');
  }
  return missing;
}

export function parseThumbnailHorizontalStep2Response(
  response: LlmBrowserResponse,
): LlmParseResult<ThumbnailHorizontalStep2Output> {
  const root = parseJsonRoot(response);
  if (!root.ok) return root;

  const missingTop = missingRequiredKeys(root.value, STEP2_REQUIRED_KEYS);
  if (missingTop.length > 0) {
    return {
      ok: false,
      reason: 'missing required fields',
      missingFields: missingTop,
      snippet: snippetFromResponse(response),
    };
  }

  const nestedMissing = collectStep2NestedMissing(root.value);
  if (nestedMissing.length > 0) {
    return {
      ok: false,
      reason: 'schema mismatch',
      missingFields: nestedMissing,
      snippet: snippetFromResponse(response),
    };
  }

  return { ok: true, value: root.value as unknown as ThumbnailHorizontalStep2Output };
}

export function tryParseThumbnailHorizontalStep2Response(
  response: LlmBrowserResponse,
): ThumbnailHorizontalStep2Output | null {
  const result = parseThumbnailHorizontalStep2Response(response);
  return result.ok ? result.value : null;
}

const STEP3_REQUIRED_KEYS = [
  'thumbnail_copy',
  'layout_tokens',
  'typography_tokens',
  'color_strategy',
  'visual_prompt',
  'negative_prompt',
  'image_generation_rules',
  'renderer_notes',
] as const;

function collectStep3NestedMissing(value: Record<string, unknown>): string[] {
  const missing: string[] = [];
  if (!validateThumbnailCopy(value.thumbnail_copy)) missing.push('thumbnail_copy');
  if (!isRecord(value.layout_tokens)) missing.push('layout_tokens');
  if (!isRecord(value.typography_tokens)) missing.push('typography_tokens');
  if (!isRecord(value.color_strategy)) missing.push('color_strategy');
  if (!isNonEmptyString(value.visual_prompt)) missing.push('visual_prompt');
  if (!isNonEmptyString(value.negative_prompt)) missing.push('negative_prompt');
  if (!isRecord(value.image_generation_rules)) missing.push('image_generation_rules');
  if (!isRecord(value.renderer_notes)) missing.push('renderer_notes');
  return missing;
}

export function parseThumbnailHorizontalStep3Response(
  response: LlmBrowserResponse,
): LlmParseResult<ThumbnailHorizontalStep3Output> {
  const root = parseJsonRoot(response);
  if (!root.ok) return root;

  const missingTop = missingRequiredKeys(root.value, STEP3_REQUIRED_KEYS);
  if (missingTop.length > 0) {
    return {
      ok: false,
      reason: 'missing required fields',
      missingFields: missingTop,
      snippet: snippetFromResponse(response),
    };
  }

  const nestedMissing = collectStep3NestedMissing(root.value);
  if (nestedMissing.length > 0) {
    return {
      ok: false,
      reason: 'schema mismatch',
      missingFields: nestedMissing,
      snippet: snippetFromResponse(response),
    };
  }

  return { ok: true, value: root.value as unknown as ThumbnailHorizontalStep3Output };
}

export function tryParseThumbnailHorizontalStep3Response(
  response: LlmBrowserResponse,
): ThumbnailHorizontalStep3Output | null {
  const result = parseThumbnailHorizontalStep3Response(response);
  return result.ok ? result.value : null;
}

export function describeThumbnailHorizontalParseFailure(
  step: 1 | 2 | 3,
  response: LlmBrowserResponse,
): string {
  const result =
    step === 1
      ? parseThumbnailHorizontalStep1Response(response)
      : step === 2
        ? parseThumbnailHorizontalStep2Response(response)
        : parseThumbnailHorizontalStep3Response(response);
  if (result.ok) return 'unknown parse failure';
  return formatParseFailureReason(result);
}
