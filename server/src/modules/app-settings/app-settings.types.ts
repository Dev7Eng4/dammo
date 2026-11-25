export interface AiSceneDensityMaxSecSettings {
  high: number;
  medium: number;
  low: number;
}

export interface AppSettings {
  enableKenBurns: boolean;
  /**
   * When true, prepare prebakes Ken Burns clips if enableKenBurns is also on.
   * Assemble still follows enableKenBurns only.
   */
  kenBurnsOnPrepare: boolean;
  enableImageTransitions: boolean;
  chromeBackgroundUseOffscreen: boolean;
  aiSceneDensityMaxSec: AiSceneDensityMaxSecSettings;
  /** Max parallel task-queue jobs (1–8). */
  taskQueueConcurrency: number;
  /** When true, emit ffmpeg progress / per-clip detail logs. When false, only timedStep summaries. */
  verboseVideoLogs: boolean;
  /**
   * Max parallel Chrome profiles for AI scene-prompt LLM chunks (1–8).
   * Uses that many profiles with the default text LLM ticked in LLM Content (clamped to how many exist).
   */
  aiScenePromptConcurrency: number;
  /**
   * Meta AI image generation: windows (tabs) opened per Chrome profile (1–5). All of them share the
   * profile's Meta account, so this is how many prompts one account gets at the same time.
   */
  metaTabsPerProfile: number;
  /** Default seeding period for a new email account, in days. */
  seedingEmailDays: number;
  /** Default seeding period for a new YouTube channel, in days. */
  seedingYoutubeDays: number;
  /**
   * After a Flow thumbnail succeeds, regenerate it once through Meta (reference = the Flow image)
   * with `removeGeminiWatermarkPrompt` to strip the Gemini star watermark.
   */
  removeGeminiWatermark: boolean;
  removeGeminiWatermarkPrompt: string;
  /**
   * Whether to update transcripts via LLM for Japanese videos with captions.
   * When true, checks existing conditions (language === 'ja' and captions not disabled).
   * When false, skips LLM transcript update completely.
   */
  enableUpdateTranscript: boolean;
  /** Alias for enableUpdateTranscript */
  disabledUpdateTranscript?: boolean;
}

export type UpdateAppSettingsInput = Partial<
  Omit<AppSettings, 'aiSceneDensityMaxSec'> & {
    aiSceneDensityMaxSec?: Partial<AiSceneDensityMaxSecSettings>;
  }
>;
