import { useState } from 'react';
import { fetchDashboardData } from '../api/dashboard';
import { AccountSummaryCard } from '../components/dashboard/AccountSummary';
import { ActiveRenderCard } from '../components/dashboard/ActiveRenderCard';
import { ContentPipeline } from '../components/dashboard/ContentPipeline';
import { HealthAlerts } from '../components/dashboard/HealthAlerts';
import { QuickActions } from '../components/dashboard/QuickActions';
import { RecentProjectsTable } from '../components/dashboard/RecentProjectsTable';
import { StatCards } from '../components/dashboard/StatCards';
import { useAbortableEffect } from '../hooks';
import type { DashboardData } from '../types/dashboard';

const emptyData: DashboardData = {
  overview: { youtubeChannels: 0, tiktokAccounts: 0, facebookAssets: 0, sourceChannels: 0 },
  pipeline: [],
  accounts: { total: 0, active: 0, needVerify: 0, limited: 0, suspended: 0, lostAccess: 0 },
  activeRender: { fileName: '', progress: 0, eta: '', filePath: '' },
  recentProjects: [],
  healthAlerts: [],
};

export function DashboardPage() {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useAbortableEffect(async (signal) => {
    setLoading(true);
    setError(null);

    try {
      const nextData = await fetchDashboardData({ signal });
      setData(nextData);
    } catch (err) {
      if (signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  if (error) {
    return (
      <div className="card-surface p-6 text-center">
        <p className="text-danger">{error}</p>
        <button
          type="button"
          className="mt-3 text-sm text-secondary-400 hover:text-secondary-300"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StatCards data={data.overview} loading={loading} />

      <div className="grid gap-4 xl:grid-cols-[1fr_240px]">
        <ContentPipeline steps={data.pipeline} loading={loading} />
        <AccountSummaryCard data={data.accounts} loading={loading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr_280px]">
        <ActiveRenderCard data={data.activeRender} loading={loading} />
        <RecentProjectsTable projects={data.recentProjects} loading={loading} />
        <div className="space-y-4">
          <HealthAlerts alerts={data.healthAlerts} loading={loading} />
          <QuickActions />
        </div>
      </div>
    </div>
  );
}
