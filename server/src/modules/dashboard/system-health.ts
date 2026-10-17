import fs from 'node:fs';
import os from 'node:os';
import { paths } from '../../config/paths.js';
import { taskQueueService } from '../task-queue/task-queue.service.js';

export interface SystemHealth {
  ram: { freeBytes: number; totalBytes: number };
  disk: { freeBytes: number; totalBytes: number } | null;
  queue: { queued: number; running: number; failed: number; paused: boolean };
}

const GB = 1024 ** 3;

export const SYSTEM_THRESHOLDS = {
  ramDangerBytes: 1.5 * GB,
  ramWarningBytes: 3 * GB,
  diskDangerBytes: 5 * GB,
  diskWarningBytes: 15 * GB,
  queueFailedWarning: 1,
} as const;

function readDisk(): SystemHealth['disk'] {
  try {
    const stats = fs.statfsSync(paths.dataDir);
    return { freeBytes: stats.bavail * stats.bsize, totalBytes: stats.blocks * stats.bsize };
  } catch {
    return null;
  }
}

export function getSystemHealth(): SystemHealth {
  const { items, paused } = taskQueueService.list('summary');
  return {
    ram: { freeBytes: os.freemem(), totalBytes: os.totalmem() },
    disk: readDisk(),
    queue: {
      queued: items.filter((job) => job.status === 'queued').length,
      running: items.filter((job) => job.status === 'running').length,
      failed: items.filter((job) => job.status === 'failed').length,
      paused,
    },
  };
}

export type HealthSeverity = 'warning' | 'neutral' | 'danger';

const fmtGb = (bytes: number) => `${(bytes / GB).toFixed(1)} GB`;

export function buildSystemAlerts(): Array<{
  id: string;
  title: string;
  description: string;
  severity: HealthSeverity;
}> {
  const health = getSystemHealth();
  const alerts: ReturnType<typeof buildSystemAlerts> = [];

  if (health.ram.freeBytes < SYSTEM_THRESHOLDS.ramWarningBytes) {
    alerts.push({
      id: 'system-ram',
      title: `RAM còn ${fmtGb(health.ram.freeBytes)} trống`,
      description: `Trên tổng ${fmtGb(health.ram.totalBytes)}. Render và tải video có thể chậm hoặc lỗi.`,
      severity: health.ram.freeBytes < SYSTEM_THRESHOLDS.ramDangerBytes ? 'danger' : 'warning',
    });
  }

  if (health.disk && health.disk.freeBytes < SYSTEM_THRESHOLDS.diskWarningBytes) {
    alerts.push({
      id: 'system-disk',
      title: `Ổ đĩa còn ${fmtGb(health.disk.freeBytes)} trống`,
      description: `Trên tổng ${fmtGb(health.disk.totalBytes)}. Video render và tải về sẽ hết chỗ.`,
      severity: health.disk.freeBytes < SYSTEM_THRESHOLDS.diskDangerBytes ? 'danger' : 'warning',
    });
  }

  if (health.queue.failed >= SYSTEM_THRESHOLDS.queueFailedWarning) {
    alerts.push({
      id: 'system-queue-failed',
      title: `${health.queue.failed} tác vụ trong hàng đợi bị lỗi`,
      description: 'Mở Task Queue để xem lỗi và chạy lại hoặc xóa.',
      severity: 'warning',
    });
  }

  if (health.queue.paused && health.queue.queued > 0) {
    alerts.push({
      id: 'system-queue-paused',
      title: `Hàng đợi đang tạm dừng (${health.queue.queued} việc chờ)`,
      description: 'Các tác vụ sẽ không chạy cho tới khi tiếp tục hàng đợi.',
      severity: 'warning',
    });
  }

  return alerts;
}
