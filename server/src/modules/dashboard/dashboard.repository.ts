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

const defaultDashboard: DashboardData = {
  overviewStats: {
    youtubeChannels: 412,
    tiktokAccounts: 856,
    facebookAssets: 124,
    sourceChannels: 52,
  },
  pipelineSteps: [
    { id: 'ideas', label: 'IDEAS', count: 15 },
    { id: 'script', label: 'SCRIPT READY', count: 8 },
    { id: 'assets', label: 'ASSETS READY', count: 22 },
    { id: 'rendering', label: 'RENDERING', count: 2, highlight: 'info' },
    { id: 'rendered', label: 'RENDERED', count: 142 },
    { id: 'uploaded', label: 'UPLOADED', count: 310, highlight: 'success' },
    { id: 'failed', label: 'FAILED', count: 4, highlight: 'danger' },
  ],
  accountSummary: {
    total: 1248,
    active: 1180,
    needVerify: 12,
    limited: 45,
    suspended: 8,
    lostAccess: 3,
  },
  activeRender: {
    fileName: 'TikTok_Daily_Hook_05.mp4',
    progress: 68,
    eta: '00:02:14',
    filePath: 'D:\\VideoOps\\Projects\\DailyHooks\\TikTok_Daily_Hook_05.mp4',
  },
  recentProjects: [
    { id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', name: 'YT_Shorts_Batch_12', format: '1080x1920', target: 'YouTube', status: 'success' },
    { id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', name: 'FB_Reels_Promo_Q2', format: '1080x1920', target: 'Facebook', status: 'failed' },
    { id: '6ba7b811-9dad-11d1-80b4-00c04fd430c8', name: 'TikTok_Daily_Hook_05', format: '1080x1920', target: 'TikTok', status: 'rendering' },
    { id: '550e8400-e29b-41d4-a716-446655440000', name: 'Multi_Platform_Campaign_A', format: '1920x1080', target: 'Multi', status: 'success' },
  ],
  healthAlerts: [
    {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      title: 'Need verification (12)',
      description: 'Mail accounts require SMS verification before upload.',
      severity: 'warning',
    },
    {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      title: 'No upload in 7 days (45)',
      description: 'TikTok channels have been inactive for over a week.',
      severity: 'neutral',
    },
    {
      id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      title: 'Copyright risk (2)',
      description: 'Strikes detected on Facebook Assets.',
      severity: 'danger',
    },
  ],
};

export class DashboardRepository {
  getData(): DashboardData {
    return defaultDashboard;
  }
}

export const dashboardRepository = new DashboardRepository();
