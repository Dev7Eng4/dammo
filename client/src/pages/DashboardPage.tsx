import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchDashboardData } from '../api/dashboard'
import { AccountSummaryCard } from '../components/dashboard/AccountSummary'
import { ActiveRenderCard } from '../components/dashboard/ActiveRenderCard'
import { ContentPipeline } from '../components/dashboard/ContentPipeline'
import { HealthAlerts } from '../components/dashboard/HealthAlerts'
import { QuickActions } from '../components/dashboard/QuickActions'
import { RecentProjectsTable } from '../components/dashboard/RecentProjectsTable'
import { StatCards } from '../components/dashboard/StatCards'
import { PageHeader, PageShell } from '../components/layout'
import { useAbortableEffect } from '../hooks'
import type { DashboardData } from '../types/dashboard'
import { LayoutDashboard } from 'lucide-react'

const emptyData: DashboardData = {
  overview: { youtubeChannels: 0, tiktokAccounts: 0, facebookAssets: 0, sourceChannels: 0 },
  pipeline: [],
  accounts: { total: 0 },
  activeRender: { fileName: '', progress: 0, eta: '', filePath: '' },
  recentProjects: [],
  healthAlerts: [],
}

export function DashboardPage() {
  const { t } = useTranslation('dashboard')
  const [data, setData] = useState<DashboardData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useAbortableEffect(async (signal) => {
    setLoading(true)
    setError(null)

    try {
      const nextData = await fetchDashboardData({ signal })
      setData(nextData)
    } catch (err) {
      if (signal.aborted) return
      setError(err instanceof Error ? err.message : t('page.loadError'))
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [])

  if (error) {
    return (
      <PageShell>
        <div className="card-surface p-6 text-center">
          <p className="text-danger">{error}</p>
          <button
            type="button"
            className="mt-3 text-sm text-secondary-400 hover:text-secondary-300"
            onClick={() => window.location.reload()}
          >
            {t('page.retry')}
          </button>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title={t('page.title')}
        subtitle={t('page.subtitle')}
        icon={LayoutDashboard}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <ContentPipeline steps={data.pipeline} loading={loading} />
        <ActiveRenderCard data={data.activeRender} loading={loading} />
      </div>

      <StatCards data={data.overview} loading={loading} />

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <RecentProjectsTable projects={data.recentProjects} loading={loading} />
        <div className="space-y-4">
          <AccountSummaryCard data={data.accounts} loading={loading} />
          <HealthAlerts alerts={data.healthAlerts} loading={loading} />
          <QuickActions />
        </div>
      </div>
    </PageShell>
  )
}
