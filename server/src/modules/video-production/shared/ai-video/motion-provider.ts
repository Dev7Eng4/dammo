import { promptsSettingsService } from '../../../prompts/prompts-settings.service.js';

/** Who turns scene images into clips in the "Ảnh → video" step. */
export type MotionClipProvider = 'flow' | 'muse' | 'meta';

export const MOTION_CLIP_PROVIDERS = ['flow', 'muse', 'meta'] as const satisfies readonly MotionClipProvider[];

export const MOTION_CLIP_PROVIDER_LABEL: Record<MotionClipProvider, string> = {
  flow: 'Google Flow (Veo)',
  muse: 'Muse',
  meta: 'Meta AI',
};

/** The "Tạo video" choice in Settings → Công cụ AI, as a clip provider. */
export function defaultMotionClipProvider(): MotionClipProvider {
  return promptsSettingsService.get().defaultVideoProvider;
}
