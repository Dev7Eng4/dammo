import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';
import type { AppSettings, UpdateAppSettingsPayload } from '../types/appSettings';

export function fetchAppSettings(options?: FetchOptions) {
  return fetchJson<{ item: AppSettings }>(`${API_V1}/app-settings`, withSignal(undefined, options));
}

export function updateAppSettings(payload: UpdateAppSettingsPayload) {
  return fetchJson<{ item: AppSettings }>(`${API_V1}/app-settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
