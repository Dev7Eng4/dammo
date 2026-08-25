import fs from 'node:fs/promises';
import path from 'node:path';
import { celebrityDir } from '../../../../config/paths.js';
import { AppError } from '../../../../shared/http/errors.js';
import { assembleSlideshow } from '../slideshow/slideshow-assembler.js';
import { pickAutoEffects } from '../slideshow/slideshow-presets.js';
import { SS_CACHE_DIRNAME, SS_DEFAULT_TRANSITION_DURATION } from '../slideshow/slideshow.constants.js';
import { FPS } from '../render-core/canvas.constants.js';
import { SI_MULTI_IMAGE_SLIDESHOW_BASENAME } from '../render-core/output-artifacts.constants.js';
import {
  SI_CENTER_VIDEO_H,
  SI_CENTER_VIDEO_W,
  SI_CELEBRITY_IMAGE_DURATION_SEC,
  SI_CELEBRITY_MAX_IMAGES,
  SI_MULTI_IMAGE_DIRNAME,
  SI_MULTI_IMAGE_DURATION_SEC,
} from './si.constants.js';
import {
  assembleSiCelebrityCenterSlideshow,
  cleanupSiCelebritySlideshowArtifacts,
} from './si-celebrity-slideshow.js';

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

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Copy image files from a celebrity media folder into `workDir/images`.
 * Videos are skipped (v1). Shuffles and caps at SI_CELEBRITY_MAX_IMAGES.
 * Returns copied destination paths.
 */
export async function copyCelebrityImagesToWorkDir(
  celebrityId: string,
  workDir: string,
  onLog?: (msg: string) => void,
): Promise<string[]> {
  const sourceDir = celebrityDir(celebrityId);
  const imagesDir = path.join(workDir, SI_MULTI_IMAGE_DIRNAME);

  await fs.rm(imagesDir, { recursive: true, force: true }).catch(() => undefined);
  await fs.mkdir(imagesDir, { recursive: true });

  let imageFiles: string[];
  try {
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    imageFiles = entries
      .filter(entry => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map(entry => entry.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  } catch {
    throw new AppError(
      `Celebrity media folder not found for ${celebrityId}`,
      400,
      'CELEBRITY_MEDIA_NOT_FOUND',
    );
  }

  if (imageFiles.length === 0) {
    throw new AppError(
      'Selected celebrity has no image files for SI video',
      400,
      'CELEBRITY_IMAGES_EMPTY',
    );
  }

  const totalAvailable = imageFiles.length;
  const selected = shuffleInPlace([...imageFiles]).slice(0, SI_CELEBRITY_MAX_IMAGES);
  onLog?.(
    `[reup-si] Celebrity images selected ${selected.length}/${totalAvailable} (max ${SI_CELEBRITY_MAX_IMAGES})`,
  );

  const copied: string[] = [];
  for (const name of selected) {
    const dest = path.join(imagesDir, name);
    await fs.copyFile(path.join(sourceDir, name), dest);
    copied.push(dest);
  }
  return copied;
}

export function resolveSiMultiImageSlideshowPath(workDir: string): string {
  return path.join(workDir, `${SI_MULTI_IMAGE_SLIDESHOW_BASENAME}.mp4`);
}

/** Build Ken Burns + xfade slideshow from center images (same effects as AI slideshow). */
export async function buildSiCenterSlideshow(
  workDir: string,
  imagePaths: string[],
  onLog?: (msg: string) => void,
  size?: { width: number; height: number },
): Promise<string> {
  if (imagePaths.length === 0) {
    throw new AppError(
      `SI multi_image requires at least one image in ${SI_MULTI_IMAGE_DIRNAME}/`,
      400,
      'SI_MULTI_IMAGE_EMPTY',
    );
  }

  const width = size?.width ?? SI_CENTER_VIDEO_W;
  const height = size?.height ?? SI_CENTER_VIDEO_H;

  const slides = pickAutoEffects(imagePaths, {
    durationSec: SI_MULTI_IMAGE_DURATION_SEC,
    transitionDurationSec: SS_DEFAULT_TRANSITION_DURATION,
  });

  const outputPath = resolveSiMultiImageSlideshowPath(workDir);
  onLog?.(
    `[reup-si] Building center slideshow: ${slides.length} images × ${SI_MULTI_IMAGE_DURATION_SEC}s → ${width}x${height}`,
  );

  await assembleSlideshow({
    slides,
    workDir,
    outputPath,
    onLog,
    output: { width, height, fps: FPS },
  });

  return outputPath;
}

/**
 * Celebrity center slideshow: ≤5 cutout images × 60s, contain-centered on
 * transparent canvas (alpha-preserving qtrle path).
 */
export async function buildSiCelebrityCenterSlideshow(
  workDir: string,
  imagePaths: string[],
  onLog?: (msg: string) => void,
  size?: { width: number; height: number },
): Promise<string> {
  const width = size?.width ?? SI_CENTER_VIDEO_W;
  const height = size?.height ?? SI_CENTER_VIDEO_H;
  const paths = imagePaths.slice(0, SI_CELEBRITY_MAX_IMAGES);

  onLog?.(
    `[reup-si] Building celebrity center slideshow: ${paths.length} images × ${SI_CELEBRITY_IMAGE_DURATION_SEC}s → ${width}x${height} (transparent contain center)`,
  );

  return assembleSiCelebrityCenterSlideshow({
    workDir,
    imagePaths: paths,
    width,
    height,
    onLog,
  });
}

export async function cleanupSiMultiImageArtifacts(workDir: string): Promise<void> {
  await fs.unlink(resolveSiMultiImageSlideshowPath(workDir)).catch(() => undefined);
  await cleanupSiCelebritySlideshowArtifacts(workDir);
  await fs.rm(path.join(workDir, SS_CACHE_DIRNAME), { recursive: true, force: true }).catch(() => undefined);
}
