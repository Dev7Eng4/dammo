import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';
import type { CreateNichePayload, Niche, NichesResponse } from '../types/niche';

export function fetchNiches(options?: FetchOptions) {
  return fetchJson<NichesResponse>(`${API_V1}/niches`, withSignal(undefined, options));
}

export function createNiche(payload: CreateNichePayload) {
  return fetchJson<{ item: Niche }>(`${API_V1}/niches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
