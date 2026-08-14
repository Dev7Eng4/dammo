import type { LlmBrowserResponse } from '../../../../infrastructure/llm-browser/llm-browser.types.js';

const SNIPPET_MAX = 1800;

export interface LlmParseFailure {
  ok: false;
  reason: string;
  missingFields?: string[];
  snippet?: string;
}

export interface LlmParseSuccess<T> {
  ok: true;
  value: T;
}

export type LlmParseResult<T> = LlmParseSuccess<T> | LlmParseFailure;

export function truncateSnippet(text: string, max = SNIPPET_MAX): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```[\w]*\n?/gm, '')
    .replace(/\n?```$/gm, '')
    .trim();
}

export function extractJsonText(response: LlmBrowserResponse): string {
  for (let i = response.codeBlocks.length - 1; i >= 0; i -= 1) {
    const block = response.codeBlocks[i].trim();
    if (block.includes('{')) {
      return stripMarkdownFences(block);
    }
  }
  return stripMarkdownFences(response.content);
}

export function snippetFromResponse(response: LlmBrowserResponse): string {
  const jsonText = extractJsonText(response);
  if (jsonText.trim()) return truncateSnippet(jsonText);
  return truncateSnippet(response.content || '');
}

export function formatParseFailureReason(failure: LlmParseFailure): string {
  if (failure.missingFields?.length) {
    return `${failure.reason}: missing ${failure.missingFields.join(', ')}`;
  }
  return failure.reason;
}
