import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';
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

export function fetchOverview(options?: FetchOptions) {
  return fetchJson<OverviewStats>(
    `${API_V1}/dashboard/overview`,
    withSignal(undefined, options),
  );
}

export function fetchPipeline(options?: FetchOptions) {
  return fetchJson<PipelineStep[]>(
    `${API_V1}/dashboard/pipeline`,
    withSignal(undefined, options),
  );
}

export function fetchAccounts(options?: FetchOptions) {
  return fetchJson<AccountSummary>(
    `${API_V1}/dashboard/accounts`,
    withSignal(undefined, options),
  );
}

export function fetchActiveRender(options?: FetchOptions) {
  return fetchJson<ActiveRender>(
    `${API_V1}/dashboard/active-render`,
    withSignal(undefined, options),
  );
}

export function fetchRecentProjects(options?: FetchOptions) {
  return fetchJson<RecentProject[]>(
    `${API_V1}/dashboard/recent-projects`,
    withSignal(undefined, options),
  );
}

export function fetchHealthAlerts(options?: FetchOptions) {
  return fetchJson<HealthAlert[]>(
    `${API_V1}/dashboard/health-alerts`,
    withSignal(undefined, options),
  );
}

export function fetchSearch(query: string, options?: FetchOptions) {
  const params = new URLSearchParams({ q: query });
  return fetchJson<SearchResponse>(
    `${API_V1}/search?${params}`,
    withSignal(undefined, options),
  );
}

export async function fetchDashboardData(options?: FetchOptions): Promise<DashboardData> {
  const [overview, pipeline, accounts, activeRender, recentProjects, healthAlerts] =
    await Promise.all([
      fetchOverview(options),
      fetchPipeline(options),
      fetchAccounts(options),
      fetchActiveRender(options),
      fetchRecentProjects(options),
      fetchHealthAlerts(options),
    ]);

  return { overview, pipeline, accounts, activeRender, recentProjects, healthAlerts };
}
