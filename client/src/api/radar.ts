import type {
  RadarFilters,
  RadarListResponse,
  RadarScanResult,
  RadarStatus,
  TrendRadarFilters,
  TrendRadarResponse,
} from '../types/radar';
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
  if (filters.verdict) params.set('verdict', filters.verdict);
  return fetchJson<RadarListResponse>(`${API_V1}/radar?${params}`, withSignal(undefined, options));
}

export function scanRadar() {
  return fetchJson<RadarScanResult>(`${API_V1}/radar/scan`, { method: 'POST' });
}

/** Hot videos stored by the jp-psy-trends brain / skill, with per-cluster counts. */
export function fetchTrendRadar(filters: TrendRadarFilters, options?: FetchOptions) {
  const params = new URLSearchParams({ days: String(filters.days) });
  if (filters.cluster) params.set('cluster', filters.cluster);
  if (filters.verdict) params.set('verdict', filters.verdict);
  return fetchJson<TrendRadarResponse>(`${API_V1}/radar/trends?${params}`, withSignal(undefined, options));
}
