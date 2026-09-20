import { appSettingsService } from '../../../app-settings/app-settings.service.js';
import type { AiScenePromptChromeProfileRole } from '../../../app-settings/app-settings.types.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../../../chrome-profiles/chrome-profiles.types.js';

export type { AiScenePromptChromeProfileRole };

/** Default Chrome profile role for scene-prompt + character-reference LLM. */
export const DEFAULT_AI_SCENE_PROMPT_CHROME_PROFILE_ROLE: AiScenePromptChromeProfileRole = 'main';

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
