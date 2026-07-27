import type { LlmBrowserResponse } from '../../../../infrastructure/llm-browser/llm-browser.types.js';
import { extractJsonText } from '../meta/meta-response.js';
import type { AiVideoCharacterReference, AiVideoScenePrompt } from './ai-video.types.js';

const SRT_TIMESTAMP_RE = /^\d{2}:\d{2}:\d{2}[,.]\d{3}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && SRT_TIMESTAMP_RE.test(value.trim());
}

function parseReferenceIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const references: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) {
      return null;
    }
    references.push(item.trim());
  }
  return references;
}

function validateScenePrompt(
  value: unknown,
  options?: { requireReferences?: boolean },
): AiVideoScenePrompt | null {
  if (!isRecord(value)) {
    return null;
  }

  const prompt = typeof value.prompt === 'string' ? value.prompt.trim() : '';
  if (!prompt) {
    return null;
  }

  if (!isValidTimestamp(value.startTime) || !isValidTimestamp(value.endTime)) {
    return null;
  }

  const requireReferences = options?.requireReferences === true;
  if (requireReferences) {
    const references = parseReferenceIds(value.references);
    if (!references) {
      return null;
    }
    return {
      prompt,
      startTime: value.startTime.trim(),
      endTime: value.endTime.trim(),
      references,
    };
  }

  if ('references' in value) {
    const references = parseReferenceIds(value.references);
    if (!references) {
      return null;
    }
    return {
      prompt,
      startTime: value.startTime.trim(),
      endTime: value.endTime.trim(),
      references,
    };
  }

  return {
    prompt,
    startTime: value.startTime.trim(),
    endTime: value.endTime.trim(),
  };
}

export function tryParseAiVideoSceneResponse(
  response: LlmBrowserResponse,
  options?: { requireReferences?: boolean },
): AiVideoScenePrompt[] | null {
  const jsonText = extractJsonText(response);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return null;
  }

  const scenes: AiVideoScenePrompt[] = [];
  for (const item of parsed) {
    const scene = validateScenePrompt(item, options);
    if (!scene) {
      return null;
    }
    scenes.push(scene);
  }

  return scenes;
}

function validateCharacterReference(value: unknown): AiVideoCharacterReference | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const description = typeof value.description === 'string' ? value.description.trim() : '';
  const prompt = typeof value.prompt === 'string' ? value.prompt.trim() : '';

  if (!id || !name || !prompt) {
    return null;
  }

  return {
    id,
    name,
    description,
    prompt,
  };
}

export function tryParseAiVideoCharacterResponse(
  response: LlmBrowserResponse,
): AiVideoCharacterReference[] | null {
  const jsonText = extractJsonText(response);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  const characters: AiVideoCharacterReference[] = [];
  for (const item of parsed) {
    const character = validateCharacterReference(item);
    if (!character) {
      return null;
    }
    characters.push(character);
  }

  return characters;
}
