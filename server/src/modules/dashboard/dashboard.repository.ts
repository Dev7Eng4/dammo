import { renderQueueService } from '../render-queue/render-queue.service.js';
import type { RenderJob } from '../render-queue/render-queue.types.js';
import { mailAccountsRepository } from '../mail-accounts/mail-accounts.repository.js';
import { sourceChannelsRepository } from '../source-channels/source-channels.repository.js';
import { videoPrepareRepository } from '../youtube-channels/video-prepare.repository.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import type { VideoPrepareStatus } from '../youtube-channels/video-prepare.types.js';
import { buildSystemAlerts } from './system-health.js';
import { getNextYoutubePublishSlot, scheduleSlotToUnixMs } from '../youtube-upload/publish-schedule.js';

export interface DashboardData {
  overviewStats: {
    youtubeChannels: number;
    tiktokAccounts: number;
    facebookAssets: number;
    sourceChannels: number;
  };
  pipelineSteps: Array<{
    id: string;
    label: string;
    count: number;
    highlight?: 'info' | 'success' | 'danger';
  }>;
  accountSummary: {
    total: number;
  };
  activeRender: {
    fileName: string;
    progress: number;
    eta: string;
    filePath: string;
  };
  recentProjects: Array<{
    id: string;
    name: string;
    format: string;
    target: string;
    status: 'success' | 'failed' | 'rendering';
  }>;
  healthAlerts: Array<{
    id: string;
    title: string;
    description: string;
    severity: 'warning' | 'neutral' | 'danger';
  }>;
}

export interface UpcomingUpload {
  channelId: string;
  name: string;
  handle: string;
  at: string;
}

const STALE_WARNING_MS = 48 * 60 * 60 * 1000;
const STALE_DANGER_MS = 7 * 24 * 60 * 60 * 1000;

const EMPTY_ACTIVE_RENDER:DashboardData['activeRender'] = {
  fileName: '',
  progress: 0,
  eta: '',
  filePath: '',
};

function countVideoPrepareByStatus(status: VideoPrepareStatus): number {
  let count = 0;
  for (const channel of youtubeChannelsRepository.findAll()) {
    count += videoPrepareRepository.countByStatus(channel.id, status);
  }
  return count;
}

function mapRenderJobStatus(status: RenderJob['status']): 'success' | 'failed' | 'rendering' {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'failed';
  return 'rendering';
}

function buildActiveRender(): DashboardData['activeRender'] {
  const job = renderQueueService.getActive();
  if (!job) return EMPTY_ACTIVE_RENDER;

  return {
    fileName: job.fileName,
    progress: job.progress,
    eta: job.eta,
    filePath: job.outputPath,
  };
}

function buildRecentProjects(): DashboardData['recentProjects'] {
  return renderQueueService
    .list()
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)
    .map(job => ({
      id: job.id,
      name: job.fileName,
      format: job.preset || 'default',
      target: 'Render',
      status: mapRenderJobStatus(job.status),
    }));
}

function buildPipelineSteps(renderJobs: RenderJob[]): DashboardData['pipelineSteps'] {
  const rendering = renderJobs.filter(job => job.status === 'processing').length;
  const rendered = renderJobs.filter(job => job.status === 'completed').length;
  const failed = renderJobs.filter(job => job.status === 'failed').length;

  return [
    { id: 'ideas', label: 'IDEAS', count: 0 },
    { id: 'script', label: 'SCRIPT READY', count: countVideoPrepareByStatus('Prepared') },
    { id: 'assets', label: 'ASSETS READY', count: countVideoPrepareByStatus('Created') },
    { id: 'rendering', label: 'RENDERING', count: rendering, highlight: rendering > 0 ? 'info' : undefined },
    { id: 'rendered', label: 'RENDERED', count: rendered },
    { id: 'uploaded', label: 'UPLOADED', count: countVideoPrepareByStatus('Uploaded'), highlight: 'success' },
    {
      id: 'failed',
      label: 'FAILED',
      count: failed + countVideoPrepareByStatus('Error'),
      highlight: failed + countVideoPrepareByStatus('Error') > 0 ? 'danger' : undefined,
    },
  ];
}

function buildHealthAlerts(): DashboardData['healthAlerts'] {
  const alerts: DashboardData['healthAlerts'] = [];
  const pausedChannels = youtubeChannelsRepository.findAll().filter(channel => channel.status === 'paused').length;

  if (pausedChannels > 0) {
    alerts.push({
      id: 'youtube-paused',
      title: `Paused channels (${pausedChannels})`,
      description: 'YouTube channels are paused and should not receive uploads.',
      severity: 'danger',
    });
  }

  const now = Date.now();
  for (const channel of youtubeChannelsRepository.findAll()) {
    if (channel.status !== 'active' || !channel.lastUploadAt) continue;
    const idleMs = now - new Date(channel.lastUploadAt).getTime();
    if (!Number.isFinite(idleMs) || idleMs < STALE_WARNING_MS) continue;
    const days = Math.floor(idleMs / (24 * 60 * 60 * 1000));
    const idleLabel = days >= 2 ? `${days} ngày` : `${Math.floor(idleMs / 3_600_000)} giờ`;
    alerts.push({
      id: `youtube-stale-${channel.id}`,
      title: `${channel.name} — ${idleLabel} chưa có video mới`,
      description: `Lần đăng gần nhất: ${new Date(channel.lastUploadAt).toLocaleString('vi-VN')}.`,
      severity: idleMs >= STALE_DANGER_MS ? 'danger' : 'warning',
    });
  }

  alerts.push(...buildSystemAlerts());

  const rank = { danger: 0, warning: 1, neutral: 2 } as const;
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function buildUpcomingUploads(limit = 6): UpcomingUpload[] {
  const items: Array<UpcomingUpload & { ms: number }> = [];
  for (const channel of youtubeChannelsRepository.findAll()) {
    if (channel.status !== 'active') continue;
    const slot = getNextYoutubePublishSlot(channel);
    const ms = scheduleSlotToUnixMs(slot);
    if (!slot || ms === Number.MAX_SAFE_INTEGER) continue;
    items.push({
      channelId: channel.id,
      name: channel.name,
      handle: channel.handle,
      at: new Date(ms).toISOString(),
      ms,
    });
  }
  return items
    .sort((a, b) => a.ms - b.ms)
    .slice(0, limit)
    .map(({ ms: _ms, ...item }) => item);
}

export class DashboardRepository {
  getUpcomingUploads(): UpcomingUpload[] {
    return buildUpcomingUploads();
  }

  getData(): DashboardData {
    const renderJobs = renderQueueService.list();
    const mailAccounts = mailAccountsRepository.findAll();

    return {
      overviewStats: {
        youtubeChannels: youtubeChannelsRepository.findAll().length,
        tiktokAccounts: 0,
        facebookAssets: 0,
        sourceChannels: sourceChannelsRepository.findAll().length,
      },
      pipelineSteps: buildPipelineSteps(renderJobs),
      accountSummary: {
        total: mailAccounts.length,
      },
      activeRender: buildActiveRender(),
      recentProjects: buildRecentProjects(),
      healthAlerts: buildHealthAlerts(),
    };
  }
}

export const dashboardRepository = new DashboardRepository();
