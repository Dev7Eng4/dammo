import { paths } from '../../config/paths.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { AppSettings, UpdateAppSettingsInput } from './app-settings.types.js';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  enableKenBurns: true,
  enableImageTransitions: true,
  chromeBackgroundUseOffscreen: true,
  aiSceneDensityMaxSec: {
    high: 8,
    medium: 30,
    low: 60,
  },
};

function clampSceneSec(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 300) return fallback;
  return rounded;
}

function loadSettings(): AppSettings {
  const stored = readJson<Partial<AppSettings>>(paths.appSettings);
  const density = stored?.aiSceneDensityMaxSec;
  return {
    enableKenBurns: stored?.enableKenBurns ?? DEFAULT_APP_SETTINGS.enableKenBurns,
    enableImageTransitions:
      stored?.enableImageTransitions ?? DEFAULT_APP_SETTINGS.enableImageTransitions,
    chromeBackgroundUseOffscreen:
      stored?.chromeBackgroundUseOffscreen ?? DEFAULT_APP_SETTINGS.chromeBackgroundUseOffscreen,
    aiSceneDensityMaxSec: {
      high: clampSceneSec(density?.high, DEFAULT_APP_SETTINGS.aiSceneDensityMaxSec.high),
      medium: clampSceneSec(density?.medium, DEFAULT_APP_SETTINGS.aiSceneDensityMaxSec.medium),
      low: clampSceneSec(density?.low, DEFAULT_APP_SETTINGS.aiSceneDensityMaxSec.low),
    },
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
    };
    writeJson(paths.appSettings, next);
    return next;
  }
}

export const appSettingsService = new AppSettingsService();
