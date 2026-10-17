import { taskQueueRepository } from '../task-queue/task-queue.repository.js';
import type { TaskJob } from '../task-queue/task-queue.types.js';

export interface ProductionStats {
  today: { completed: number; failed: number; videos: number };
  last7Days: { completed: number; failed: number; videos: number };
  /** Average wall-clock minutes per produced video (task run time ÷ videoCount); null without samples. */
  avgMinutesPerVideo: number | null;
  /** Number of completed create_video tasks the average is based on. */
  sampleSize: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// The queue only retains recent jobs, so this is "the most recent window", not a long-term history.
const QUEUE_SCAN_LIMIT = 200;

function startOfLocalDay(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function videosIn(job: TaskJob): number {
  const count = (job.payload as { videoCount?: number }).videoCount;
  return typeof count === 'number' && count > 0 ? count : 1;
}

/** Task start ≈ first log entry (queue wait excluded); falls back to createdAt. */
function runMinutes(job: TaskJob): number | null {
  const startIso = job.logs?.[0]?.at ?? job.createdAt;
  const ms = new Date(job.updatedAt).getTime() - new Date(startIso).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms / 60_000 : null;
}

export function getProductionStats(now = Date.now()): ProductionStats {
  const todayStart = startOfLocalDay(now);
  const weekStart = now - 7 * DAY_MS;
  const stats: ProductionStats = {
    today: { completed: 0, failed: 0, videos: 0 },
    last7Days: { completed: 0, failed: 0, videos: 0 },
    avgMinutesPerVideo: null,
    sampleSize: 0,
  };

  let totalMinutes = 0;
  let totalVideos = 0;

  for (const job of taskQueueRepository.listAll(QUEUE_SCAN_LIMIT)) {
    if (job.type !== 'create_video') continue;
    if (job.status !== 'completed' && job.status !== 'failed') continue;
    const finishedAt = new Date(job.updatedAt).getTime();
    if (!Number.isFinite(finishedAt) || finishedAt < weekStart) continue;

    const buckets = [stats.last7Days, ...(finishedAt >= todayStart ? [stats.today] : [])];
    for (const bucket of buckets) {
      if (job.status === 'completed') {
        bucket.completed += 1;
        bucket.videos += videosIn(job);
      } else {
        bucket.failed += 1;
      }
    }

    if (job.status === 'completed') {
      const minutes = runMinutes(job);
      if (minutes !== null) {
        totalMinutes += minutes;
        totalVideos += videosIn(job);
        stats.sampleSize += 1;
      }
    }
  }

  if (totalVideos > 0) stats.avgMinutesPerVideo = totalMinutes / totalVideos;
  return stats;
}
