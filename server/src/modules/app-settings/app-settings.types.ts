export interface AiSceneDensityMaxSecSettings {
  high: number;
  medium: number;
  low: number;
}

export interface AppSettings {
  enableKenBurns: boolean;
  enableImageTransitions: boolean;
  chromeBackgroundUseOffscreen: boolean;
  aiSceneDensityMaxSec: AiSceneDensityMaxSecSettings;
  /** Max parallel task-queue jobs (1–8). */
  taskQueueConcurrency: number;
}

export type UpdateAppSettingsInput = Partial<
  Omit<AppSettings, 'aiSceneDensityMaxSec'> & {
    aiSceneDensityMaxSec?: Partial<AiSceneDensityMaxSecSettings>;
  }
>;
