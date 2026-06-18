import type { TaskJobListItem, TaskType } from '../types/taskQueue';

export function getTaskTypeLabel(type: TaskType): string {
  switch (type) {
    case 'add_source':
      return 'SOURCE IMPORT';
    case 'create_video':
      return 'REUP VIDEO';
  }
}

export function getTaskDetailLine(job: TaskJobListItem): string {
  if (job.status === 'failed' && job.error) return job.error;
  if (job.status === 'completed') {
    const outputPath = getTaskOutputPath(job);
    if (outputPath) return outputPath;
    const sourceId = getTaskSourceId(job);
    if (sourceId) return `Source saved · ${sourceId}`;
    return job.progressLabel ?? 'Completed';
  }
  if (job.status === 'queued') return 'Pending worker availability';
  return job.progressLabel ?? 'Processing';
}

export function getTaskOutputPath(job: TaskJobListItem): string | null {
  if (job.outputPath) return job.outputPath;
  if (job.type !== 'create_video' || !('result' in job) || !job.result || typeof job.result !== 'object') {
    return null;
  }
  const result = job.result as { items?: Array<{ outputPath?: string }> };
  return result.items?.[0]?.outputPath ?? null;
}

export function getTaskSourceId(job: TaskJobListItem): string | null {
  if (job.sourceId) return job.sourceId;
  if (job.type !== 'add_source' || !('result' in job) || !job.result || typeof job.result !== 'object') {
    return null;
  }
  const result = job.result as { item?: { id?: string } };
  return result.item?.id ?? null;
}

export function formatTaskTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function matchesTaskSearch(job: TaskJobListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    job.title,
    job.subtitle,
    job.progressLabel,
    job.error,
    getTaskTypeLabel(job.type),
    getTaskOutputPath(job),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function getTaskProgressValue(job: TaskJobListItem): number {
  if (job.status === 'completed') return 100;
  if (job.status === 'queued' || job.status === 'cancelled') return 0;
  return job.progress;
}
