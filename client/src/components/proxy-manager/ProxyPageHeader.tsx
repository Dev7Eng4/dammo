import { Shield } from 'lucide-react'
import { PageHeader } from '../layout'
import { PageTabs } from '../ui'
import type { ProxyTab } from '../../types/proxy'

const tabs: Array<{ id: ProxyTab; label: string }> = [
  { id: 'monitoring', label: 'Giám sát' },
  { id: 'providers', label: 'Nhà cung cấp' },
]

interface ProxyPageHeaderProps {
  activeTab: ProxyTab
  onTabChange: (tab: ProxyTab) => void
}

export function ProxyPageHeader({ activeTab, onTabChange }: ProxyPageHeaderProps) {
  return (
    <div className="mb-5 space-y-4">
      <PageHeader title="Quản lý Proxy" subtitle="Giám sát và nhà cung cấp proxy" icon={Shield} />
      <PageTabs
        variant="underline"
        value={activeTab}
        onValueChange={(value) => onTabChange(value as ProxyTab)}
        items={tabs}
      />
    </div>
  )
}
