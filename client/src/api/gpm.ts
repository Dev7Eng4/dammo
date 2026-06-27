import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';
import type {
  CreateGpmGroupPayload,
  CreateGpmProfilePayload,
  GpmConnectionStatus,
  GpmGroup,
  GpmListParams,
  GpmPaginated,
  GpmProfile,
  GpmStartResult,
  UpdateGpmGroupPayload,
  UpdateGpmProfilePayload,
  GpmTestResult,
} from '../types/gpm';

function buildQuery(params: GpmListParams = {}): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.page_size !== undefined) search.set('page_size', String(params.page_size));
  if (params.search) search.set('search', params.search);
  if (params.sort !== undefined) search.set('sort', String(params.sort));
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function fetchGpmStatus(options?: FetchOptions) {
  return fetchJson<{ item: GpmConnectionStatus }>(
    `${API_V1}/gpm/status`,
    withSignal(undefined, options),
  );
}

export function fetchGpmProfiles(params: GpmListParams = {}, options?: FetchOptions) {
  return fetchJson<{ item: GpmPaginated<GpmProfile> }>(
    `${API_V1}/gpm/profiles${buildQuery(params)}`,
    withSignal(undefined, options),
  );
}

export function fetchGpmProfile(id: string, options?: FetchOptions) {
  return fetchJson<{ item: GpmProfile }>(
    `${API_V1}/gpm/profiles/${id}`,
    withSignal(undefined, options),
  );
}

export function createGpmProfile(payload: CreateGpmProfilePayload) {
  return fetchJson<{ item: GpmProfile }>(`${API_V1}/gpm/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function updateGpmProfile(id: string, payload: UpdateGpmProfilePayload) {
  return fetchJson<{ item: GpmProfile }>(`${API_V1}/gpm/profiles/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deleteGpmProfile(id: string, mode: 'soft' | 'hard' = 'soft') {
  return fetchJson<{ ok: boolean }>(`${API_V1}/gpm/profiles/${id}?mode=${mode}`, {
    method: 'DELETE',
  });
}

export function startGpmProfile(id: string) {
  return fetchJson<{ item: GpmStartResult }>(`${API_V1}/gpm/profiles/${id}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

export function stopGpmProfile(id: string) {
  return fetchJson<{ ok: boolean }>(`${API_V1}/gpm/profiles/${id}/stop`, {
    method: 'POST',
  });
}

export function testGpmProfile(id: string) {
  return fetchJson<{ item: GpmTestResult }>(`${API_V1}/gpm/profiles/${id}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

export function fetchGpmGroups(params: GpmListParams = {}, options?: FetchOptions) {
  return fetchJson<{ item: GpmPaginated<GpmGroup> }>(
    `${API_V1}/gpm/groups${buildQuery(params)}`,
    withSignal(undefined, options),
  );
}

export function createGpmGroup(payload: CreateGpmGroupPayload) {
  return fetchJson<{ item: GpmGroup }>(`${API_V1}/gpm/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function updateGpmGroup(id: string, payload: UpdateGpmGroupPayload) {
  return fetchJson<{ item: GpmGroup }>(`${API_V1}/gpm/groups/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deleteGpmGroup(id: string) {
  return fetchJson<{ ok: boolean }>(`${API_V1}/gpm/groups/${id}`, {
    method: 'DELETE',
  });
}
