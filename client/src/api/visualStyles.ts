import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';
import type {
  CreateVisualStylePayload,
  UpdateVisualStylePayload,
  VisualStyle,
  VisualStylesResponse,
} from '../types/visualStyle';

export function fetchVisualStyles(options?: FetchOptions) {
  return fetchJson<VisualStylesResponse>(
    `${API_V1}/visual-styles`,
    withSignal(undefined, options),
  );
}

export function fetchVisualStyle(id: string, options?: FetchOptions) {
  return fetchJson<{ item: VisualStyle }>(
    `${API_V1}/visual-styles/${id}`,
    withSignal(undefined, options),
  );
}

export function createVisualStyle(payload: CreateVisualStylePayload) {
  return fetchJson<{ item: VisualStyle }>(`${API_V1}/visual-styles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function updateVisualStyle(id: string, payload: UpdateVisualStylePayload) {
  return fetchJson<{ item: VisualStyle }>(`${API_V1}/visual-styles/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deleteVisualStyle(id: string) {
  return fetchJson<{ ok: true }>(`${API_V1}/visual-styles/${id}`, {
    method: 'DELETE',
  });
}
