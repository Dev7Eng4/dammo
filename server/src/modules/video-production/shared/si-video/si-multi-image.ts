import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../../../shared/http/errors.js';
import { assembleSlideshow } from '../slideshow/slideshow-assembler.js';
import { pickAutoEffects } from '../slideshow/slideshow-presets.js';
import { SS_CACHE_DIRNAME, SS_DEFAULT_TRANSITION_DURATION } from '../slideshow/slideshow.constants.js';
import {
  SI_CENTER_VIDEO_H,
  SI_CENTER_VIDEO_W,
  SI_FPS,
  SI_MULTI_IMAGE_DIRNAME,
  SI_MULTI_IMAGE_DURATION_SEC,
  SI_MULTI_IMAGE_SLIDESHOW_BASENAME,
} from './si.constants.js';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);

/** List image files under `workDir/images`, sorted numeric-aware. */
export async function listSiMultiImagePaths(workDir: string): Promise<string[]> {
  const imagesDir = path.join(workDir, SI_MULTI_IMAGE_DIRNAME);
  try {
    const entries = await fs.readdir(imagesDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map(entry => path.join(imagesDir, entry.name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  } catch {
    return [];
  }
}

export function resolveSiMultiImageSlideshowPath(workDir: string): string {
  return path.join(workDir, `${SI_MULTI_IMAGE_SLIDESHOW_BASENAME}.mp4`);
}

/** Build Ken Burns + xfade slideshow from center images (same effects as AI slideshow). */
export async function buildSiCenterSlideshow(
  workDir: string,
  imagePaths: string[],
  onLog?: (msg: string) => void,
): Promise<string> {
  if (imagePaths.length === 0) {
    throw new AppError(
      `SI multi_image requires at least one image in ${SI_MULTI_IMAGE_DIRNAME}/`,
      400,
      'SI_MULTI_IMAGE_EMPTY',
    );
  }

  const slides = pickAutoEffects(imagePaths, {
    durationSec: SI_MULTI_IMAGE_DURATION_SEC,
    transitionDurationSec: SS_DEFAULT_TRANSITION_DURATION,
  });

  const outputPath = resolveSiMultiImageSlideshowPath(workDir);
  onLog?.(
    `[reup-si] Building center slideshow: ${slides.length} images × ${SI_MULTI_IMAGE_DURATION_SEC}s → ${SI_CENTER_VIDEO_W}x${SI_CENTER_VIDEO_H}`,
  );

  await assembleSlideshow({
    slides,
    workDir,
    outputPath,
    onLog,
    output: { width: SI_CENTER_VIDEO_W, height: SI_CENTER_VIDEO_H, fps: SI_FPS },
  });

  return outputPath;
}

export async function cleanupSiMultiImageArtifacts(workDir: string): Promise<void> {
  await fs.unlink(resolveSiMultiImageSlideshowPath(workDir)).catch(() => undefined);
  await fs.rm(path.join(workDir, SS_CACHE_DIRNAME), { recursive: true, force: true }).catch(() => undefined);
}
