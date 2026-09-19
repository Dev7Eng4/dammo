import { Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../layout'
import { PageTabs } from '../ui'
import type { ProxyTab } from '../../types/proxy'

interface ProxyPageHeaderProps {
  activeTab: ProxyTab
  onTabChange: (tab: ProxyTab) => void
}

export function ProxyPageHeader({ activeTab, onTabChange }: ProxyPageHeaderProps) {
  const { t } = useTranslation('browser')

  const tabs: Array<{ id: ProxyTab; label: string }> = [
    { id: 'monitoring', label: t('proxy.tab.monitoring') },
    { id: 'providers', label: t('proxy.tab.providers') },
  ]

  return (
    <div className="mb-5 space-y-4">
      <PageHeader title={t('proxy.page.title')} subtitle={t('proxy.page.subtitle')} icon={Shield} />
      <PageTabs
        variant="underline"
        value={activeTab}
        onValueChange={(value) => onTabChange(value as ProxyTab)}
        items={tabs}
      />
    </div>
  )
}
