import { dashboardRepository } from './dashboard.repository.js';

export class DashboardService {
  getOverview() {
    return dashboardRepository.getData().overviewStats;
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

  getHealthAlerts() {
    return dashboardRepository.getData().healthAlerts;
  }
}

export const dashboardService = new DashboardService();
