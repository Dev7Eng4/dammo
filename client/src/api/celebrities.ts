import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';
import type {
  CelebrityListItem,
  CelebrityMediaItem,
  CreateCelebrityInput,
} from '../types/celebrity';

export function fetchCelebrities(options?: FetchOptions) {
  return fetchJson<{ items: CelebrityListItem[] }>(
    `${API_V1}/celebrities`,
    withSignal(undefined, options),
  );
}

export function createCelebrity(input: CreateCelebrityInput) {
  return fetchJson<{ item: CelebrityListItem }>(`${API_V1}/celebrities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteCelebrity(id: string) {
  return fetchJson<{ ok: true }>(`${API_V1}/celebrities/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function fetchCelebrityMedia(id: string, options?: FetchOptions) {
  return fetchJson<{ items: CelebrityMediaItem[] }>(
    `${API_V1}/celebrities/${encodeURIComponent(id)}/media`,
    withSignal(undefined, options),
  );
}

export function celebrityMediaUrl(id: string, filename: string): string {
  return `${API_V1}/celebrities/${encodeURIComponent(id)}/media/${encodeURIComponent(filename)}`;
}

export function uploadCelebrityMedia(id: string, file: File) {
  const body = new FormData();
  body.append('file', file);
  return fetchJson<{ item: CelebrityMediaItem }>(
    `${API_V1}/celebrities/${encodeURIComponent(id)}/media`,
    { method: 'POST', body },
  );
}

export function deleteCelebrityMedia(id: string, names: string[]) {
  return fetchJson<{ deleted: string[] }>(
    `${API_V1}/celebrities/${encodeURIComponent(id)}/media`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names }),
    },
  );
}
