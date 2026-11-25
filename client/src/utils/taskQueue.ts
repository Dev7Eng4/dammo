import i18n from '../i18n';
import type { TaskJobListItem, TaskStage, TaskType } from '../types/taskQueue';
import { appLocale } from './locale';

const TASK_TYPE_KEYS: Record<TaskType, string> = {
  add_source: 'queue.type.importSource',
  create_video: 'queue.type.createVideo',
  upload_video: 'queue.type.uploadVideo',
  download_source: 'queue.type.downloadSource',
};

export function getTaskTypeLabel(type: TaskType): string {
  return i18n.t(TASK_TYPE_KEYS[type], { ns: 'factory' });
}

/** The server labels stages in Vietnamese, so name the known ones by id. */
export function getTaskStageLabel(stage: TaskStage): string {
  const key = stage.id === 'download' && stage.label.startsWith('Sao chép') ? 'copy_assets' : stage.id;
  return i18n.t(`queue.stageName.${key}`, { ns: 'factory', defaultValue: stage.label });
}

export function getTaskDetailLine(job: TaskJobListItem): string {
  if (job.status === 'failed') {
    const failedStage = job.stages?.find((stage) => stage.status === 'failed');
    if (failedStage?.error) return `${getTaskStageLabel(failedStage)}: ${failedStage.error}`;
    if (job.error) return job.error;
  }
  if (job.status === 'completed') {
    const outputPath = getTaskOutputPath(job);
    if (outputPath) return outputPath;
    const sourceId = getTaskSourceId(job);
    if (sourceId) return i18n.t('queue.job.savedSource', { ns: 'factory', id: sourceId });
    return job.progressLabel ?? i18n.t('queue.job.completed', { ns: 'factory' });
  }
  if (job.status === 'queued') return i18n.t('queue.job.waitingWorker', { ns: 'factory' });
  const doing = job.stages?.find((stage) => stage.status === 'doing');
  if (doing) return i18n.t('queue.job.doingLabel', { ns: 'factory', label: getTaskStageLabel(doing) });
  return job.progressLabel ?? i18n.t('queue.job.processing', { ns: 'factory' });
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
  return date.toLocaleTimeString(appLocale(), { hour: 'numeric', minute: '2-digit' });
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
