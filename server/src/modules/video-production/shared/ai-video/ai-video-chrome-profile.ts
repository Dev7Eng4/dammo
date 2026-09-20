import { AppError } from '../../../../shared/http/errors.js';
import { appSettingsService } from '../../../app-settings/app-settings.service.js';
import type { AiScenePromptChromeProfileRole } from '../../../app-settings/app-settings.types.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../../../chrome-profiles/chrome-profiles.types.js';

export type { AiScenePromptChromeProfileRole };

/** Default Chrome profile role for scene-prompt + character-reference LLM. */
export const DEFAULT_AI_SCENE_PROMPT_CHROME_PROFILE_ROLE: AiScenePromptChromeProfileRole = 'main';

export const AI_SCENE_PROMPT_CONCURRENCY_MIN = 1;
export const AI_SCENE_PROMPT_CONCURRENCY_MAX = 8;

/**
 * Pick the Chrome profile used for AI scene prompt and character-reference LLM chat.
 * Role comes from app settings (`aiScenePromptChromeProfileRole`); default is main.
 */
export function pickAiScenePromptChromeProfile(): ChromeProfile {
  const role =
    appSettingsService.get().aiScenePromptChromeProfileRole ??
    DEFAULT_AI_SCENE_PROMPT_CHROME_PROFILE_ROLE;

  return role === 'main'
    ? chromeProfilesService.requireMainProfile()
    : chromeProfilesService.pickSubProfile();
}

/** Clamp scene-prompt concurrency to the allowed 1–8 range. */
export function clampAiScenePromptConcurrency(value: number | undefined, fallback = 1): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(
    AI_SCENE_PROMPT_CONCURRENCY_MAX,
    Math.max(AI_SCENE_PROMPT_CONCURRENCY_MIN, Math.round(value)),
  );
}

/**
 * Resolve Chrome profiles for scene-prompt LLM chunks.
 * Concurrency ≤ 1 → single profile from role setting.
 * Concurrency > 1 → up to N sub profiles (clamped to available count).
 */
export function resolveAiScenePromptProfiles(concurrency: number): ChromeProfile[] {
  const requested = clampAiScenePromptConcurrency(concurrency, 1);
  if (requested <= 1) {
    return [pickAiScenePromptChromeProfile()];
  }

  const subs = chromeProfilesService.list().items.filter(profile => profile.role === 'sub');
  if (subs.length === 0) {
    throw new AppError(
      'Scene prompt concurrency > 1 requires at least one sub Chrome profile. Create sub profiles first.',
      409,
      'NO_SUB_PROFILE',
    );
  }

  const count = Math.min(requested, subs.length);
  return chromeProfilesService.pickSubProfiles(count);
}
