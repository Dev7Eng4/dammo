import { chromeProfilesService, contentLlmForProvider } from '../chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../chrome-profiles/chrome-profiles.types.js';
import type { LlmTextProvider } from '../llm-browser/core/types.js';
import type { PromptsSettings } from './prompts-settings.types.js';
import { promptsSettingsService } from './prompts-settings.service.js';

/** Text jobs with their own LLM + Chrome profile in Settings → AI tools → Content. */
export type ContentTask = 'content' | 'scriptRemake' | 'scenePrompt' | 'metadata';

const TASK_KEYS = {
  content: { llm: 'defaultLlmProvider', profile: 'contentChromeProfileId' },
  scriptRemake: { llm: 'scriptRemakeLlmProvider', profile: 'scriptRemakeChromeProfileId' },
  scenePrompt: { llm: 'scenePromptLlmProvider', profile: 'scenePromptChromeProfileId' },
  metadata: { llm: 'metadataLlmProvider', profile: 'metadataChromeProfileId' },
} as const satisfies Record<ContentTask, { llm: keyof PromptsSettings; profile: keyof PromptsSettings }>;

/** Text LLM chosen for `task`. */
export function contentTaskProvider(task: ContentTask): LlmTextProvider {
  return promptsSettingsService.get()[TASK_KEYS[task].llm];
}

/**
 * Profiles with `provider`'s LLM ticked, in pick order: the profile chosen for `task` first (when it has
 * that LLM), then the rest. May be empty.
 */
export function listContentTaskProfiles(
  task: ContentTask,
  provider: string = contentTaskProvider(task),
): ChromeProfile[] {
  const profiles = chromeProfilesService.listProfilesForLlm('content', contentLlmForProvider(provider));
  const chosenId = promptsSettingsService.get()[TASK_KEYS[task].profile];
  if (!chosenId) return profiles;

  const chosen = profiles.find(profile => profile.id === chosenId);
  if (!chosen) {
    console.warn(
      `[content-task] ${task}: chosen Chrome profile ${chosenId} is gone or has no ${provider} ticked — using another`,
    );
    return profiles;
  }
  return [chosen, ...profiles.filter(profile => profile.id !== chosenId)];
}

/** Up to `count` profiles for `task` (chosen one first); throws `NO_LLM_PROFILE` when none has the LLM. */
export function pickContentTaskProfiles(
  task: ContentTask,
  count: number,
  provider: string = contentTaskProvider(task),
): ChromeProfile[] {
  const profiles = listContentTaskProfiles(task, provider);
  if (profiles.length === 0) {
    // Same error the chat pickers raise, naming the LLM to tick.
    chromeProfilesService.requireProfileForLlm('content', contentLlmForProvider(provider));
  }
  return profiles.slice(0, Math.max(1, count));
}

/** The profile for one `task` chat: the chosen one when it has the LLM, else the first that does. */
export function pickContentTaskProfile(task: ContentTask, provider?: string): ChromeProfile {
  return pickContentTaskProfiles(task, 1, provider)[0]!;
}
