export interface AiSceneDensityMaxSecSettings {
  high: number;
  medium: number;
  low: number;
}

export interface AppSettings {
  enableKenBurns: boolean;
  /** When true, prepare prebakes Ken Burns clips if enableKenBurns is also on. */
  kenBurnsOnPrepare: boolean;
  enableImageTransitions: boolean;
  chromeBackgroundUseOffscreen: boolean;
  aiSceneDensityMaxSec: AiSceneDensityMaxSecSettings;
  /** Max parallel task-queue jobs (1–8). */
  taskQueueConcurrency: number;
  /** When true, emit ffmpeg progress / per-clip detail logs. When false, only step summaries. */
  verboseVideoLogs: boolean;
  /** Max parallel Chrome profiles for scene-prompt LLM chunks (1–8). */
  aiScenePromptConcurrency: number;
  /** Meta AI image generation: windows per Chrome profile (1–5), i.e. prompts one account runs at once. */
  metaTabsPerProfile: number;
  /** Default seeding period for a new email account, in days. */
  seedingEmailDays: number;
  /** Default seeding period for a new YouTube channel, in days. */
  seedingYoutubeDays: number;
  /** After a Flow thumbnail succeeds, regenerate it through Meta with the prompt below to strip the Gemini star. */
  removeGeminiWatermark: boolean;
  removeGeminiWatermarkPrompt: string;
  /** Whether to update transcripts via LLM for Japanese videos with captions. */
  enableUpdateTranscript: boolean;
  /** Alias for enableUpdateTranscript */
  disabledUpdateTranscript?: boolean;
}

export type UpdateAppSettingsPayload = Partial<
  Omit<AppSettings, 'aiSceneDensityMaxSec'> & {
    aiSceneDensityMaxSec?: Partial<AiSceneDensityMaxSecSettings>;
  }
>;

export type SettingsTab = 'ai-tools' | 'voice' | 'video-ai' | 'chrome' | 'video' | 'task-queue' | 'seeding';

export const SETTINGS_TABS: readonly SettingsTab[] = ['ai-tools', 'voice', 'video-ai', 'chrome', 'video', 'task-queue', 'seeding'];
