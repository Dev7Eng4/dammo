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
  /** Max parallel Chrome profiles for scene-prompt LLM chunks (1–8). */
  aiScenePromptConcurrency: number;
  /**
   * When true, verify prompt input length after paste (tolerance + clear/retry if short).
   * When false, skip length checks and length-based fallbacks.
   */
  checkPromptFillLength: boolean;
}

export type UpdateAppSettingsPayload = Partial<
  Omit<AppSettings, 'aiSceneDensityMaxSec'> & {
    aiSceneDensityMaxSec?: Partial<AiSceneDensityMaxSecSettings>;
  }
>;

export type SettingsTab = 'video-ai' | 'chrome' | 'video' | 'task-queue';
