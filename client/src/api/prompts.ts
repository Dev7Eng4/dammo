import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';
import type { PaginatedResponse } from '../types/pagination';
import type {
  CreatePromptPayload,
  Prompt,
  PromptPlaygroundResult,
  PromptPlaygroundRunPayload,
  PromptResolved,
  PromptCategory,
  PromptLanguage,
  UpdatePromptPayload,
  PromptsSettings,
  UpdatePromptsSettingsPayload,
} from '../types/prompt';

export function fetchPrompts(
  category?: PromptCategory,
  language?: PromptLanguage,
  query = '',
  page = 1,
  limit = 100,
  options?: FetchOptions,
) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (language) params.set('language', language);
  if (query.trim()) params.set('q', query.trim());
  params.set('page', String(page));
  params.set('limit', String(limit));
  return fetchJson<PaginatedResponse<Prompt>>(
    `${API_V1}/prompts?${params}`,
    withSignal(undefined, options),
  );
}

export function fetchPrompt(id: string, options?: FetchOptions) {
  return fetchJson<{ item: Prompt }>(
    `${API_V1}/prompts/${id}`,
    withSignal(undefined, options),
  );
}

export function resolvePrompt(key: string, language: PromptLanguage, options?: FetchOptions) {
  const params = new URLSearchParams({ language });
  return fetchJson<{ item: PromptResolved }>(
    `${API_V1}/prompts/key/${encodeURIComponent(key)}/resolve?${params}`,
    withSignal(undefined, options),
  );
}

export function createPrompt(payload: CreatePromptPayload) {
  return fetchJson<{ item: Prompt }>(`${API_V1}/prompts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function updatePrompt(id: string, payload: UpdatePromptPayload) {
  return fetchJson<{ item: Prompt }>(`${API_V1}/prompts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deletePrompt(id: string) {
  return fetchJson<{ ok: boolean }>(`${API_V1}/prompts/${id}`, {
    method: 'DELETE',
  });
}

export function runPromptPlayground(payload: PromptPlaygroundRunPayload) {
  return fetchJson<{ item: PromptPlaygroundResult }>(`${API_V1}/prompts/playground/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function fetchPromptSettings(options?: FetchOptions) {
  return fetchJson<{ item: PromptsSettings }>(
    `${API_V1}/prompts/settings`,
    withSignal(undefined, options),
  );
}

export function updatePromptSettings(payload: UpdatePromptsSettingsPayload) {
  return fetchJson<{ item: PromptsSettings }>(`${API_V1}/prompts/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
