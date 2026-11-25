import fs from 'node:fs/promises';
import path from 'node:path';
import { appSettingsService } from '../../../app-settings/app-settings.service.js';
import { isMetaQuotaExhaustedError, metaQuotaExhaustedError } from '../../../llm-browser/meta/meta-quota.js';
import {
  listMetaImageProfiles,
  resolveThumbnailImageProvider,
  runBrowserImageGeneration,
  type FlowProfileOptions,
  type HeroImageProgress,
} from './hero-image.js';

const REFERENCE_FILENAME = 'ref-watermark.jpg';
const CLEANED_FILENAME = 'thumbnail-nowm.jpg';

export interface RemoveGeminiWatermarkOptions extends FlowProfileOptions {
  onProgress?: (progress: HeroImageProgress) => void;
}

/**
 * Regenerate `thumbnailPath` through Meta: the thumbnail is attached as the only reference and `prompt`
 * is sent as-is. The result is saved next to the thumbnail as `thumbnail-nowm.jpg` exactly as downloaded
 * (no 1280x720 resize); the caller decides what to do with it.
 *
 * Runs on the Chrome profiles with Meta ticked in LLM Image (`options.profileId` first when it is one of
 * them). A profile out of Meta's daily image quota is skipped for 12h and the next one is opened, so one
 * exhausted account does not stop the watermark removal. Throws when Meta fails, or when every profile is
 * out of quota. With no profile ticked for Meta it runs on the Flow profile as before.
 */
export async function generateThumbnailWithoutWatermark(
  thumbnailPath: string,
  prompt: string,
  options?: RemoveGeminiWatermarkOptions,
): Promise<string> {
  const workDir = path.dirname(thumbnailPath);
  const referencePath = path.join(workDir, REFERENCE_FILENAME);
  const { profiles, exhausted } = listMetaImageProfiles(options?.profileId);
  if (profiles.length === 0 && exhausted.length > 0) {
    console.warn(
      `[remove-gemini-watermark] every Meta profile is out of quota: ${exhausted.map(profile => profile.name).join(', ')}`,
    );
    throw metaQuotaExhaustedError();
  }
  // No profile ticked for Meta: the provider picks one (the Flow profile), as before.
  const attempts: (string | undefined)[] = profiles.length > 0 ? profiles.map(profile => profile.id) : [options?.profileId];

  try {
    // Short, ASCII-only attach path (same reason runDefaultFlowThumbnail copies references).
    await fs.copyFile(thumbnailPath, referencePath);
    for (let index = 0; index < attempts.length; index += 1) {
      const profileId = attempts[index];
      const name = profiles[index]?.name ?? 'default';
      try {
        console.log(`[remove-gemini-watermark] Meta on profile ${name}...`);
        const result = await runBrowserImageGeneration(prompt, workDir, {
          provider: 'meta',
          fileName: CLEANED_FILENAME,
          referenceImagePaths: [referencePath],
          skipResize: true,
          profileId,
          onProgress: options?.onProgress,
        });
        await fs.access(result.imagePath);
        return result.imagePath;
      } catch (err) {
        if (!isMetaQuotaExhaustedError(err) || index === attempts.length - 1) throw err;
        console.warn(
          `[remove-gemini-watermark] profile ${name} is out of Meta quota → trying ${profiles[index + 1]?.name}`,
        );
      }
    }
    throw metaQuotaExhaustedError();
  } finally {
    await fs.unlink(referencePath).catch(() => undefined);
  }
}

/**
 * Optional post-step (Settings → "Xóa watermark Gemini"): when the thumbnail came from Flow, regenerate it
 * through Meta and replace the thumbnail with the result.
 *
 * Never throws: on any failure the original Flow thumbnail is kept, so a thumbnail is still delivered.
 * Returns the path of the thumbnail to use (always `thumbnailPath`).
 */
export async function removeGeminiWatermarkIfEnabled(
  thumbnailPath: string,
  options?: RemoveGeminiWatermarkOptions,
): Promise<string> {
  const settings = appSettingsService.get();
  if (!settings.removeGeminiWatermark) return thumbnailPath;

  if (resolveThumbnailImageProvider() !== 'flow') {
    console.log('[remove-gemini-watermark] skipped: thumbnail was not generated with Flow');
    return thumbnailPath;
  }

  const cleanedPath = path.join(path.dirname(thumbnailPath), CLEANED_FILENAME);
  try {
    console.log('[remove-gemini-watermark] Regenerating thumbnail via Meta to remove the watermark...');
    const generatedPath = await generateThumbnailWithoutWatermark(
      thumbnailPath,
      settings.removeGeminiWatermarkPrompt,
      options,
    );
    if (path.resolve(generatedPath) !== path.resolve(thumbnailPath)) {
      await fs.copyFile(generatedPath, thumbnailPath);
    }
    console.log('[remove-gemini-watermark] Watermark-free thumbnail saved');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[remove-gemini-watermark] failed, keeping the Flow thumbnail (non-fatal): ${reason}`);
  } finally {
    await fs.unlink(cleanedPath).catch(() => undefined);
  }

  return thumbnailPath;
}
