import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../../../chrome-profiles/chrome-profiles.types.js';
import { listContentTaskProfiles, pickContentTaskProfile, pickContentTaskProfiles } from '../../../prompts/content-task.js';
import { promptsSettingsService } from '../../../prompts/prompts-settings.service.js';

export const AI_SCENE_PROMPT_CONCURRENCY_MIN = 1;
export const AI_SCENE_PROMPT_CONCURRENCY_MAX = 8;

/**
 * Pick the Chrome profile used for AI scene prompt and character-design LLM chat: the scene-prompt
 * profile from Settings when it has the scene-prompt LLM ticked, else the first profile that does.
 */
export function pickAiScenePromptChromeProfile(): ChromeProfile {
  return pickContentTaskProfile('scenePrompt');
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
 * Resolve Chrome profiles for scene-prompt LLM chunks: up to `concurrency` profiles with the scene-prompt
 * LLM ticked, the one chosen in Settings first (clamped to how many exist).
 */
export function resolveAiScenePromptProfiles(concurrency: number): ChromeProfile[] {
  return pickContentTaskProfiles('scenePrompt', clampAiScenePromptConcurrency(concurrency, 1));
}

export interface ParallelScenePromptProfiles {
  profiles: ChromeProfile[];
  /** Flow image profiles held by scene prompts; character images must not use them. */
  reservedFlowProfileIds: string[];
}

/**
 * Scene-prompt profiles that can run alongside character images without sharing a browser.
 * Prefers chat profiles that are not image profiles. With Flow, a profile that does both may be
 * reserved for chat as long as another Flow profile is left for the images. Meta cannot exclude
 * profiles, so only non-image profiles qualify there.
 * Returns undefined when no such split exists, so the caller must run the two tasks sequentially.
 */
export function resolveParallelScenePromptProfiles(
  concurrency: number,
): ParallelScenePromptProfiles | undefined {
  const requested = clampAiScenePromptConcurrency(concurrency, 1);
  const imageProvider = promptsSettingsService.get().defaultReferenceImageProvider;
  const chatProfiles = listContentTaskProfiles('scenePrompt');
  const imageIds = new Set(
    chromeProfilesService.listProfilesForLlm('image', imageProvider).map(profile => profile.id),
  );

  const freeFirst = [
    ...chatProfiles.filter(profile => !imageIds.has(profile.id)),
    ...chatProfiles.filter(profile => imageIds.has(profile.id)),
  ];

  const picked: ChromeProfile[] = [];
  let imageProfilesLeft = imageIds.size;
  for (const profile of freeFirst) {
    if (picked.length >= requested) break;
    if (imageIds.has(profile.id)) {
      if (imageProvider !== 'flow' || imageProfilesLeft <= 1) continue;
      imageProfilesLeft -= 1;
    }
    picked.push(profile);
  }

  if (picked.length === 0) return undefined;
  return {
    profiles: picked,
    reservedFlowProfileIds: picked.filter(profile => imageIds.has(profile.id)).map(profile => profile.id),
  };
}
