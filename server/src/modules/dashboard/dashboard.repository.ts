import { renderQueueService } from '../render-queue/render-queue.service.js';
import type { RenderJob } from '../render-queue/render-queue.types.js';
import { mailAccountsRepository } from '../mail-accounts/mail-accounts.repository.js';
import { sourceChannelsRepository } from '../source-channels/source-channels.repository.js';
import { videoPrepareRepository } from '../youtube-channels/video-prepare.repository.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import type { VideoPrepareStatus } from '../youtube-channels/video-prepare.types.js';

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
    active: number;
    needVerify: number;
    limited: number;
    suspended: number;
    lostAccess: number;
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

const EMPTY_ACTIVE_RENDER: DashboardData['activeRender'] = {
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
  const mailAccounts = mailAccountsRepository.findAll();
  const needVerify = mailAccounts.filter(account => account.status === 'need_verify').length;
  const suspendedChannels = youtubeChannelsRepository.findAll().filter(channel => channel.status === 'suspended').length;

  if (needVerify > 0) {
    alerts.push({
      id: 'mail-need-verify',
      title: `Need verification (${needVerify})`,
      description: 'Mail accounts require verification before upload.',
      severity: 'warning',
    });
  }

  if (suspendedChannels > 0) {
    alerts.push({
      id: 'youtube-suspended',
      title: `Suspended channels (${suspendedChannels})`,
      description: 'YouTube channels are suspended and should not receive uploads.',
      severity: 'danger',
    });
  }

  return alerts;
}

export class DashboardRepository {
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
        active: mailAccounts.filter(account => account.status === 'active').length,
        needVerify: mailAccounts.filter(account => account.status === 'need_verify').length,
        limited: 0,
        suspended: mailAccounts.filter(account => account.status === 'suspended').length,
        lostAccess: 0,
      },
      activeRender: buildActiveRender(),
      recentProjects: buildRecentProjects(),
      healthAlerts: buildHealthAlerts(),
    };
  }
}

export const dashboardRepository = new DashboardRepository();
