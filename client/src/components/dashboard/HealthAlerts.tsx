import { AlertTriangle } from 'lucide-react'
import { AlertCard } from '../ui/AlertCard'
import type { HealthAlert } from '../../types/dashboard'

interface HealthAlertsProps {
  alerts: HealthAlert[]
  loading?: boolean
}

export function HealthAlerts({ alerts, loading }: HealthAlertsProps) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="size-4 text-warning" />
        <p className="text-sm font-medium text-muted-foreground">Cảnh báo sức khỏe</p>
      </div>
      <div className="space-y-2">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
            ))
          : alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                title={alert.title}
                description={alert.description}
                severity={alert.severity}
              />
            ))}
      </div>
    </div>
  )
}
