import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';
import type { MascotInput, MascotListItem } from '../types/mascot';

export function fetchMascots(options?: FetchOptions) {
  return fetchJson<{ items: MascotListItem[] }>(`${API_V1}/mascots`, withSignal(undefined, options));
}

export function createMascot(input: MascotInput) {
  return fetchJson<{ item: MascotListItem }>(`${API_V1}/mascots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateMascot(id: string, input: Partial<MascotInput>) {
  return fetchJson<{ item: MascotListItem }>(`${API_V1}/mascots/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteMascot(id: string) {
  return fetchJson<{ ok: true }>(`${API_V1}/mascots/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/** `version` busts the browser cache after the image is replaced. */
export function mascotImageUrl(id: string, version?: string): string {
  const base = `${API_V1}/mascots/${encodeURIComponent(id)}/image`;
  return version ? `${base}?v=${encodeURIComponent(version)}` : base;
}

export function uploadMascotImage(id: string, file: File) {
  const body = new FormData();
  body.append('file', file);
  return fetchJson<{ item: MascotListItem }>(`${API_V1}/mascots/${encodeURIComponent(id)}/image`, {
    method: 'POST',
    body,
  });
}

export function deleteMascotImage(id: string) {
  return fetchJson<{ item: MascotListItem }>(`${API_V1}/mascots/${encodeURIComponent(id)}/image`, {
    method: 'DELETE',
  });
}
