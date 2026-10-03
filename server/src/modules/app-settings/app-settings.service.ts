import { paths } from '../../config/paths.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type {
  AiScenePromptChromeProfileRole,
  AppSettings,
  UpdateAppSettingsInput,
} from './app-settings.types.js';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  enableKenBurns: true,
  kenBurnsOnPrepare: false,
  enableImageTransitions: true,
  chromeBackgroundUseOffscreen: true,
  aiSceneDensityMaxSec: {
    high: 8,
    medium: 30,
    low: 60,
  },
  taskQueueConcurrency: 1,
  verboseVideoLogs: true,
  aiScenePromptChromeProfileRole: 'main',
  aiScenePromptConcurrency: 1,
  seedingEmailDays: 5,
  seedingYoutubeDays: 3,
};

function clampDays(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 365) return fallback;
  return rounded;
}

function resolveScenePromptChromeProfileRole(
  value: unknown,
  fallback: AiScenePromptChromeProfileRole,
): AiScenePromptChromeProfileRole {
  return value === 'main' || value === 'sub' ? value : fallback;
}

function clampSceneSec(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 300) return fallback;
  return rounded;
}

function clampConcurrency(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(8, Math.max(1, Math.round(value)));
}

function loadSettings(): AppSettings {
  const stored = readJson<Partial<AppSettings>>(paths.appSettings);
  const density = stored?.aiSceneDensityMaxSec;
  return {
    enableKenBurns: stored?.enableKenBurns ?? DEFAULT_APP_SETTINGS.enableKenBurns,
    kenBurnsOnPrepare: stored?.kenBurnsOnPrepare ?? DEFAULT_APP_SETTINGS.kenBurnsOnPrepare,
    enableImageTransitions:
      stored?.enableImageTransitions ?? DEFAULT_APP_SETTINGS.enableImageTransitions,
    chromeBackgroundUseOffscreen:
      stored?.chromeBackgroundUseOffscreen ?? DEFAULT_APP_SETTINGS.chromeBackgroundUseOffscreen,
    aiSceneDensityMaxSec: {
      high: clampSceneSec(density?.high, DEFAULT_APP_SETTINGS.aiSceneDensityMaxSec.high),
      medium: clampSceneSec(density?.medium, DEFAULT_APP_SETTINGS.aiSceneDensityMaxSec.medium),
      low: clampSceneSec(density?.low, DEFAULT_APP_SETTINGS.aiSceneDensityMaxSec.low),
    },
    taskQueueConcurrency: clampConcurrency(
      stored?.taskQueueConcurrency,
      DEFAULT_APP_SETTINGS.taskQueueConcurrency,
    ),
    verboseVideoLogs: stored?.verboseVideoLogs ?? DEFAULT_APP_SETTINGS.verboseVideoLogs,
    aiScenePromptChromeProfileRole: resolveScenePromptChromeProfileRole(
      stored?.aiScenePromptChromeProfileRole,
      DEFAULT_APP_SETTINGS.aiScenePromptChromeProfileRole,
    ),
    aiScenePromptConcurrency: clampConcurrency(
      stored?.aiScenePromptConcurrency,
      DEFAULT_APP_SETTINGS.aiScenePromptConcurrency,
    ),
    seedingEmailDays: clampDays(stored?.seedingEmailDays, DEFAULT_APP_SETTINGS.seedingEmailDays),
    seedingYoutubeDays: clampDays(
      stored?.seedingYoutubeDays,
      DEFAULT_APP_SETTINGS.seedingYoutubeDays,
    ),
  };
}

export class AppSettingsService {
  get(): AppSettings {
    return loadSettings();
  }

  update(input: UpdateAppSettingsInput): AppSettings {
    const current = loadSettings();
    const next: AppSettings = {
      enableKenBurns: input.enableKenBurns ?? current.enableKenBurns,
      kenBurnsOnPrepare: input.kenBurnsOnPrepare ?? current.kenBurnsOnPrepare,
      enableImageTransitions: input.enableImageTransitions ?? current.enableImageTransitions,
      chromeBackgroundUseOffscreen:
        input.chromeBackgroundUseOffscreen ?? current.chromeBackgroundUseOffscreen,
      aiSceneDensityMaxSec: {
        high: clampSceneSec(
          input.aiSceneDensityMaxSec?.high,
          current.aiSceneDensityMaxSec.high,
        ),
        medium: clampSceneSec(
          input.aiSceneDensityMaxSec?.medium,
          current.aiSceneDensityMaxSec.medium,
        ),
        low: clampSceneSec(input.aiSceneDensityMaxSec?.low, current.aiSceneDensityMaxSec.low),
      },
      taskQueueConcurrency: clampConcurrency(
        input.taskQueueConcurrency,
        current.taskQueueConcurrency,
      ),
      verboseVideoLogs: input.verboseVideoLogs ?? current.verboseVideoLogs,
      aiScenePromptChromeProfileRole: resolveScenePromptChromeProfileRole(
        input.aiScenePromptChromeProfileRole ?? current.aiScenePromptChromeProfileRole,
        current.aiScenePromptChromeProfileRole,
      ),
      aiScenePromptConcurrency: clampConcurrency(
        input.aiScenePromptConcurrency,
        current.aiScenePromptConcurrency,
      ),
      seedingEmailDays: clampDays(input.seedingEmailDays, current.seedingEmailDays),
      seedingYoutubeDays: clampDays(input.seedingYoutubeDays, current.seedingYoutubeDays),
    };
    writeJson(paths.appSettings, next);
    return next;
  }
}

export const appSettingsService = new AppSettingsService();
