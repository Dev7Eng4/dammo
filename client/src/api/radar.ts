import type { RadarFilters, RadarListResponse, RadarScanResult, RadarStatus } from '../types/radar';
import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';

export function fetchRadarStatus(options?: FetchOptions) {
  return fetchJson<RadarStatus>(`${API_V1}/radar/status`, withSignal(undefined, options));
}

export function fetchRadar(filters: RadarFilters, options?: FetchOptions) {
  const params = new URLSearchParams({
    maxAgeHours: String(filters.maxAgeHours),
    minRatio: String(filters.minRatio),
  });
  return fetchJson<RadarListResponse>(`${API_V1}/radar?${params}`, withSignal(undefined, options));
}

export function scanRadar() {
  return fetchJson<RadarScanResult>(`${API_V1}/radar/scan`, { method: 'POST' });
}
