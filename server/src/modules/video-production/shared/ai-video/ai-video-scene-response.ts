import type { LlmBrowserResponse } from '../../../../infrastructure/llm-browser/llm-browser.types.js';
import { extractJsonText } from '../meta/meta-response.js';
import type { AiVideoScenePrompt } from './ai-video.types.js';

const SRT_TIMESTAMP_RE = /^\d{2}:\d{2}:\d{2}[,.]\d{3}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && SRT_TIMESTAMP_RE.test(value.trim());
}

function validateScenePrompt(value: unknown): AiVideoScenePrompt | null {
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

  return {
    prompt,
    startTime: value.startTime.trim(),
    endTime: value.endTime.trim(),
  };
}

export function tryParseAiVideoSceneResponse(response: LlmBrowserResponse): AiVideoScenePrompt[] | null {
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
    const scene = validateScenePrompt(item);
    if (!scene) {
      return null;
    }
    scenes.push(scene);
  }

  return scenes;
}
