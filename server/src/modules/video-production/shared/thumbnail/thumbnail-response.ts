import type { LlmBrowserResponse } from '../../../../infrastructure/llm-browser/llm-browser.types.js';
import { extractJsonText } from '../meta/meta-response.js';
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

function validateStep1Nested(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isRecord(value.characters)) return false;
  if (!validateThumbnailCharacter(value.characters.character_1)) return false;
  if (!validateThumbnailCharacter(value.characters.character_2)) return false;
  if (!hasRequiredKeys(value.ctr_reasoning, ['why_this_moment_is_clickable', 'what_viewer_will_wonder', 'main_curiosity_gap'])) {
    return false;
  }
  if (
    !hasRequiredKeys(value.thumbnail_angle, ['line_1_concept', 'line_2_concept', 'line_3_concept', 'twist_line_concept'])
  ) {
    return false;
  }
  if (
    !hasRequiredKeys(value.risk_flags, [
      'real_person_risk',
      'minor_risk',
      'explicit_sexual_content_risk',
      'graphic_violence_risk',
      'copyright_or_logo_risk',
      'defamation_risk',
    ])
  ) {
    return false;
  }
  return isNonEmptyString(value.safety_notes);
}

export function tryParseThumbnailHorizontalStep1Response(response: LlmBrowserResponse): ThumbnailHorizontalStep1Output | null {
  const jsonText = extractJsonText(response);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (!hasRequiredKeys(parsed, STEP1_REQUIRED_KEYS)) return null;
  if (!validateStep1Nested(parsed)) return null;

  return parsed as unknown as ThumbnailHorizontalStep1Output;
}

const STEP2_REQUIRED_KEYS = ['thumbnail_copy', 'copy_intent', 'length_check', 'safety_check'] as const;

function validateStep2Nested(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!validateThumbnailCopy(value.thumbnail_copy)) return false;
  if (!hasRequiredKeys(value.copy_intent, ['line_1_role', 'line_2_role', 'line_3_role', 'twist_line_role'])) {
    return false;
  }
  if (
    !hasRequiredKeys(value.length_check, [
      'line_1_visual_length',
      'line_2_visual_length',
      'line_3_visual_length',
      'twist_line_visual_length',
      'top_lines_balanced',
    ])
  ) {
    return false;
  }
  if (
    !hasRequiredKeys(value.safety_check, [
      'no_explicit_sexual_wording',
      'no_real_person_claim',
      'no_copyrighted_reference',
      'no_unsupported_fact',
    ])
  ) {
    return false;
  }
  const lengthCheck = value.length_check;
  return isRecord(lengthCheck) && typeof lengthCheck.top_lines_balanced === 'boolean';
}

export function tryParseThumbnailHorizontalStep2Response(response: LlmBrowserResponse): ThumbnailHorizontalStep2Output | null {
  const jsonText = extractJsonText(response);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (!hasRequiredKeys(parsed, STEP2_REQUIRED_KEYS)) return null;
  if (!validateStep2Nested(parsed)) return null;

  return parsed as unknown as ThumbnailHorizontalStep2Output;
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

function validateStep3Nested(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!validateThumbnailCopy(value.thumbnail_copy)) return false;
  if (!isRecord(value.layout_tokens)) return false;
  if (!isRecord(value.typography_tokens)) return false;
  if (!isRecord(value.color_strategy)) return false;
  if (!isNonEmptyString(value.visual_prompt)) return false;
  if (!isNonEmptyString(value.negative_prompt)) return false;
  if (!isRecord(value.image_generation_rules)) return false;
  if (!isRecord(value.renderer_notes)) return false;
  return true;
}

export function tryParseThumbnailHorizontalStep3Response(response: LlmBrowserResponse): ThumbnailHorizontalStep3Output | null {
  const jsonText = extractJsonText(response);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (!hasRequiredKeys(parsed, STEP3_REQUIRED_KEYS)) return null;
  if (!validateStep3Nested(parsed)) return null;

  return parsed as unknown as ThumbnailHorizontalStep3Output;
}
