import fs from 'node:fs/promises';
import path from 'node:path';
import { appSettingsService } from '../../../app-settings/app-settings.service.js';
import {
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
 * (no 1280x720 resize); the caller decides what to do with it. Throws when Meta fails.
 */
export async function generateThumbnailWithoutWatermark(
  thumbnailPath: string,
  prompt: string,
  options?: RemoveGeminiWatermarkOptions,
): Promise<string> {
  const workDir = path.dirname(thumbnailPath);
  const referencePath = path.join(workDir, REFERENCE_FILENAME);

  try {
    // Short, ASCII-only attach path (same reason runDefaultFlowThumbnail copies references).
    await fs.copyFile(thumbnailPath, referencePath);
    const result = await runBrowserImageGeneration(prompt, workDir, {
      provider: 'meta',
      fileName: CLEANED_FILENAME,
      referenceImagePaths: [referencePath],
      skipResize: true,
      profileId: options?.profileId,
      onProgress: options?.onProgress,
    });
    await fs.access(result.imagePath);
    return result.imagePath;
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
