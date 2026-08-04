import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';
import type {
  ChromeProfile,
  ChromeProfilesResponse,
  CreateChromeProfilePayload,
  ResetSubProfilesResponse,
  UpdateChromeProfilePayload,
} from '../types/chromeProfile';

export function fetchChromeProfiles(options?: FetchOptions) {
  return fetchJson<ChromeProfilesResponse>(
    `${API_V1}/chrome-profiles`,
    withSignal(undefined, options),
  );
}

export function createChromeProfile(payload: CreateChromeProfilePayload) {
  return fetchJson<{ item: ChromeProfile }>(`${API_V1}/chrome-profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function updateChromeProfile(id: string, payload: UpdateChromeProfilePayload) {
  return fetchJson<{ item: ChromeProfile }>(`${API_V1}/chrome-profiles/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function openChromeProfile(id: string) {
  return fetchJson<{ item: ChromeProfile }>(`${API_V1}/chrome-profiles/${id}/open`, {
    method: 'POST',
  });
}

export function setMainChromeProfile(id: string) {
  return fetchJson<{ item: ChromeProfile }>(`${API_V1}/chrome-profiles/${id}/set-main`, {
    method: 'POST',
  });
}

export function setSubChromeProfile(id: string) {
  return fetchJson<{ item: ChromeProfile }>(`${API_V1}/chrome-profiles/${id}/set-sub`, {
    method: 'POST',
  });
}

export function resetSubChromeProfiles() {
  return fetchJson<ResetSubProfilesResponse>(`${API_V1}/chrome-profiles/reset-sub-profiles`, {
    method: 'POST',
  });
}
