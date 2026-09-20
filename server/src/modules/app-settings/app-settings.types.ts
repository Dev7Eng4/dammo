export interface AiSceneDensityMaxSecSettings {
  high: number;
  medium: number;
  low: number;
}

/** Chrome profile role used for AI scene prompt + character-reference LLM chat. */
export type AiScenePromptChromeProfileRole = 'main' | 'sub';

export interface AppSettings {
  enableKenBurns: boolean;
  enableImageTransitions: boolean;
  chromeBackgroundUseOffscreen: boolean;
  aiSceneDensityMaxSec: AiSceneDensityMaxSecSettings;
  /** Max parallel task-queue jobs (1–8). */
  taskQueueConcurrency: number;
  /** When true, emit ffmpeg progress / per-clip detail logs. When false, only timedStep summaries. */
  verboseVideoLogs: boolean;
  /**
   * Which Chrome profile to open for scene-prompt LLM (and character reference design).
   * Does not affect image generation or metadata.
   */
  aiScenePromptChromeProfileRole: AiScenePromptChromeProfileRole;
}

export type UpdateAppSettingsInput = Partial<
  Omit<AppSettings, 'aiSceneDensityMaxSec'> & {
    aiSceneDensityMaxSec?: Partial<AiSceneDensityMaxSecSettings>;
  }
>;
