export interface AiSceneDensityMaxSecSettings {
  high: number;
  medium: number;
  low: number;
}

export type AiScenePromptChromeProfileRole = 'main' | 'sub';

export interface AppSettings {
  enableKenBurns: boolean;
  enableImageTransitions: boolean;
  chromeBackgroundUseOffscreen: boolean;
  aiSceneDensityMaxSec: AiSceneDensityMaxSecSettings;
  /** Max parallel task-queue jobs (1–8). */
  taskQueueConcurrency: number;
  /** When true, emit ffmpeg progress / per-clip detail logs. When false, only step summaries. */
  verboseVideoLogs: boolean;
  /** Chrome profile for scene-prompt + character-reference LLM. */
  aiScenePromptChromeProfileRole: AiScenePromptChromeProfileRole;
}

export type UpdateAppSettingsPayload = Partial<
  Omit<AppSettings, 'aiSceneDensityMaxSec'> & {
    aiSceneDensityMaxSec?: Partial<AiSceneDensityMaxSecSettings>;
  }
>;

export type SettingsTab = 'video-ai' | 'chrome' | 'video' | 'task-queue';
