import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';
import type {
  CreateNichePayload,
  Niche,
  NichesResponse,
  NicheUsage,
  UpdateNichePayload,
} from '../types/niche';

export function fetchNiches(options?: FetchOptions) {
  return fetchJson<NichesResponse>(`${API_V1}/niches`, withSignal(undefined, options));
}

export function fetchNicheUsage(key: string, options?: FetchOptions) {
  return fetchJson<{ usage: NicheUsage }>(
    `${API_V1}/niches/${encodeURIComponent(key)}/usage`,
    withSignal(undefined, options),
  );
}

export function createNiche(payload: CreateNichePayload) {
  return fetchJson<{ item: Niche }>(`${API_V1}/niches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function updateNiche(key: string, payload: UpdateNichePayload) {
  return fetchJson<{ item: Niche }>(`${API_V1}/niches/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deleteNiche(key: string) {
  return fetchJson<{ ok: true }>(`${API_V1}/niches/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
}
