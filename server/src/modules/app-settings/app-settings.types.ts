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

export type UpdateAppSettingsInput = Partial<
  Omit<AppSettings, 'aiSceneDensityMaxSec'> & {
    aiSceneDensityMaxSec?: Partial<AiSceneDensityMaxSecSettings>;
  }
>;
