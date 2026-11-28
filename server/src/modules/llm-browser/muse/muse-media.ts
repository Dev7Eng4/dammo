import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from '../../../config/paths.js';
import { materializeStillJpeg, resizeImageToFit } from '../../../infrastructure/ffmpeg/image-resize.js';

/** 16:9 images are fitted to the size every other image provider delivers. */
export const MUSE_IMAGE_WIDTH = 1280;
export const MUSE_IMAGE_HEIGHT = 720;

export interface MuseSaveOptions {
  outputPath?: string;
  outputDir?: string;
  fileName?: string;
  aspectRatio?: '16:9' | '3:4';
  /** Keep Muse's full size (still converted to JPEG). */
  skipResize?: boolean;
}

/** Where the image goes; always a `.jpg`, whatever extension the caller gave. */
export function resolveMuseImagePath(options: MuseSaveOptions = {}): string {
  const asJpg = (file: string): string => `${path.parse(file).name}.jpg`;
  if (options.outputPath?.trim()) {
    const resolved = path.resolve(options.outputPath.trim());
    return path.join(path.dirname(resolved), asJpg(resolved));
  }
  const dir = options.outputDir?.trim()
    ? path.resolve(options.outputDir.trim())
    : path.join(paths.mediaDownloadsDir, 'muse-test');
  const name = options.fileName?.trim()
    ? asJpg(options.fileName.trim())
    : `muse-image-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
  return path.join(dir, name);
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return '.jpg';
  if (mimeType.includes('avif')) return '.avif';
  return '.webp';
}

/** Where the video goes; always a `.mp4`. */
export function resolveMuseVideoPath(options: MuseSaveOptions = {}): string {
  const asMp4 = (file: string): string => `${path.parse(file).name}.mp4`;
  if (options.outputPath?.trim()) {
    const resolved = path.resolve(options.outputPath.trim());
    return path.join(path.dirname(resolved), asMp4(resolved));
  }
  const dir = options.outputDir?.trim()
    ? path.resolve(options.outputDir.trim())
    : path.join(paths.mediaDownloadsDir, 'muse-test');
  const name = options.fileName?.trim()
    ? asMp4(options.fileName.trim())
    : `muse-video-${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`;
  return path.join(dir, name);
}

/** Muse's video is already a 1280x720 MP4: write it as it is. */
export async function saveMuseVideo(bytes: Buffer, options: MuseSaveOptions = {}): Promise<string> {
  const outputPath = resolveMuseVideoPath(options);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, bytes);
  return outputPath;
}

/** Write Muse's image (webp) as a JPEG, fitted to 1280x720 for 16:9 unless `skipResize`. */
export async function saveMuseImage(bytes: Buffer, mimeType: string, options: MuseSaveOptions = {}): Promise<string> {
  const outputPath = resolveMuseImagePath(options);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const tmpPath = `${outputPath}.download${extensionFor(mimeType)}`;
  try {
    await fs.writeFile(tmpPath, bytes);
    if ((options.aspectRatio ?? '16:9') === '16:9' && !options.skipResize) {
      await resizeImageToFit(tmpPath, outputPath, MUSE_IMAGE_WIDTH, MUSE_IMAGE_HEIGHT);
    } else {
      await materializeStillJpeg(tmpPath, outputPath);
    }
  } finally {
    await fs.unlink(tmpPath).catch(() => undefined);
  }
  return outputPath;
}
