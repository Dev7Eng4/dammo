import { AlertCard } from '../ui/AlertCard';
import type { HealthAlert } from '../../types/dashboard';

interface HealthAlertsProps {
  alerts: HealthAlert[];
  loading?: boolean;
}

export function HealthAlerts({ alerts, loading }: HealthAlertsProps) {
  return (
    <div className="card-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <svg className="size-4 text-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Cảnh báo sức khỏe</p>
      </div>
      <div className="space-y-2">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-neutral-800" />
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
  );
}
