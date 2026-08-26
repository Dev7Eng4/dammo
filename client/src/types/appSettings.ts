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
}

export type UpdateAppSettingsPayload = Partial<
  Omit<AppSettings, 'aiSceneDensityMaxSec'> & {
    aiSceneDensityMaxSec?: Partial<AiSceneDensityMaxSecSettings>;
  }
>;

export type SettingsTab = 'video-ai' | 'chrome' | 'video';
