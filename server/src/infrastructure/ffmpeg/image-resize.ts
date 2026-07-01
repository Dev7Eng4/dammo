import fs from 'node:fs/promises';
import { runFfmpeg } from './ffmpeg-runner.js';

/**
 * Resize an image so it fits within `width`x`height` while keeping its aspect
 * ratio (a 16:9 source becomes exactly `width`x`height`). Uses ffmpeg only, no
 * extra native dependency. Writes a single frame JPEG at high quality.
 */
export async function resizeImageToFit(
  inputPath: string,
  outputPath: string,
  width: number,
  height: number,
  onLog?: (msg: string) => void,
): Promise<void> {
  const vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease`;
  await runFfmpeg(
    ['-y', '-i', inputPath, '-vf', vf, '-frames:v', '1', '-q:v', '2', outputPath],
    { onLog, label: 'image-resize', encoderFallback: false },
  );
}

/**
 * Resize an image in place (overwrites the original). Writes to a temp file
 * first, then atomically renames over the source so a failed run never leaves a
 * corrupt image behind. Only safe for images dedicated to a single video.
 */
export async function resizeImageInPlace(
  imagePath: string,
  width: number,
  height: number,
  onLog?: (msg: string) => void,
): Promise<void> {
  const tmpPath = `${imagePath}.resize.tmp.jpg`;
  await resizeImageToFit(imagePath, tmpPath, width, height, onLog);
  await fs.rename(tmpPath, imagePath);
}
