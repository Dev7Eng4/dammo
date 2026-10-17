import { getTrendingSourceVideos } from './trending-source-videos.js';
import { getProductionStats } from './production-stats.js';
import { getSystemHealth } from './system-health.js';
import { dashboardRepository } from './dashboard.repository.js';
import { dashboardSnapshotsRepository } from './dashboard-snapshots.repository.js';

export class DashboardService {
  getOverview() {
    return dashboardRepository.getData().overviewStats;
  }

  getOverviewTrends() {
    return dashboardSnapshotsRepository.getTrends(dashboardRepository.getData().overviewStats);
  }

  getPipeline() {
    return dashboardRepository.getData().pipelineSteps;
  }

  getAccounts() {
    return dashboardRepository.getData().accountSummary;
  }

  getActiveRender() {
    return dashboardRepository.getData().activeRender;
  }

  getRecentProjects() {
    return dashboardRepository.getData().recentProjects;
  }

  getUpcomingUploads() {
    return dashboardRepository.getUpcomingUploads();
  }

  getTrendingSources() {
    return getTrendingSourceVideos();
  }

  getProductionStats() {
    return getProductionStats();
  }

  getSystemHealth() {
    return getSystemHealth();
  }

  getHealthAlerts() {
    return dashboardRepository.getData().healthAlerts;
  }
}

export const dashboardService = new DashboardService();
