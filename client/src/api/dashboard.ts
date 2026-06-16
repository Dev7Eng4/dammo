import { API_V1 } from './config';
import type {
  AccountSummary,
  ActiveRender,
  DashboardData,
  HealthAlert,
  OverviewStats,
  PipelineStep,
  RecentProject,
  SearchResponse,
} from '../types/dashboard';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export function fetchOverview() {
  return fetchJson<OverviewStats>(`${API_V1}/dashboard/overview`);
}

export function fetchPipeline() {
  return fetchJson<PipelineStep[]>(`${API_V1}/dashboard/pipeline`);
}

export function fetchAccounts() {
  return fetchJson<AccountSummary>(`${API_V1}/dashboard/accounts`);
}

export function fetchActiveRender() {
  return fetchJson<ActiveRender>(`${API_V1}/dashboard/active-render`);
}

export function fetchRecentProjects() {
  return fetchJson<RecentProject[]>(`${API_V1}/dashboard/recent-projects`);
}

export function fetchHealthAlerts() {
  return fetchJson<HealthAlert[]>(`${API_V1}/dashboard/health-alerts`);
}

export function fetchSearch(query: string) {
  const params = new URLSearchParams({ q: query });
  return fetchJson<SearchResponse>(`${API_V1}/search?${params}`);
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const [overview, pipeline, accounts, activeRender, recentProjects, healthAlerts] =
    await Promise.all([
      fetchOverview(),
      fetchPipeline(),
      fetchAccounts(),
      fetchActiveRender(),
      fetchRecentProjects(),
      fetchHealthAlerts(),
    ]);

  return { overview, pipeline, accounts, activeRender, recentProjects, healthAlerts };
}
