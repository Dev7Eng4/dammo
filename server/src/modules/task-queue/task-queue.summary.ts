import type { TaskJob, TaskJobSummary } from './task-queue.types.js';

function getOutputPath(job: TaskJob): string | undefined {
  if (job.type !== 'create_video' || !job.result || typeof job.result !== 'object') return undefined;
  const result = job.result as { items?: Array<{ outputPath?: string }> };
  return result.items?.[0]?.outputPath;
}

function getSourceId(job: TaskJob): string | undefined {
  if (job.type !== 'add_source' || !job.result || typeof job.result !== 'object') return undefined;
  const result = job.result as { item?: { id?: string } };
  return result.item?.id;
}

function getVideoId(job: TaskJob): string | undefined {
  if (job.type !== 'create_video' || !job.result || typeof job.result !== 'object') return undefined;
  const result = job.result as { items?: Array<{ videoId?: string }> };
  return result.items?.[0]?.videoId;
}

export function toTaskJobSummary(job: TaskJob): TaskJobSummary {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    title: job.title,
    subtitle: job.subtitle,
    progress: job.progress,
    progressLabel: job.progressLabel,
    error: job.error,
    livePhase: job.livePhase,
    logCount: job.logs?.length ?? 0,
    payload: job.payload,
    outputPath: getOutputPath(job),
    sourceId: getSourceId(job),
    videoId: getVideoId(job),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
