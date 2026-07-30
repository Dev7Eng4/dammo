import fs from 'node:fs/promises';
import { runFfmpeg } from './ffmpeg-runner.js';

/**
 * Decode any still (JPEG/PNG/WebP/AVIF/…) to a single high-quality JPEG.
 * Needed before `-f image2 -loop 1` — that demuxer only accepts real image
 * sequences, and YouTube avatars are often AVIF saved as `.jpg`.
 */
export async function materializeStillJpeg(
  inputPath: string,
  outputPath: string,
  onLog?: (msg: string) => void,
): Promise<void> {
  await runFfmpeg(
    ['-y', '-i', inputPath, '-frames:v', '1', '-q:v', '2', outputPath],
    { onLog, label: 'image-materialize', encoderFallback: false },
  );
}

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
 * Resize to target width and bake global opacity into a PNG with alpha.
 * Merge can overlay this still without runtime colorchannelmixer.
 */
export async function bakeStillWithOpacity(
  inputPath: string,
  outputPath: string,
  width: number,
  opacity: number,
  onLog?: (msg: string) => void,
): Promise<void> {
  const vf = `scale=${width}:-1,format=rgba,colorchannelmixer=aa=${opacity}`;
  const tempPath = `${outputPath}.tmp.png`;
  await runFfmpeg(
    ['-y', '-i', inputPath, '-vf', vf, '-frames:v', '1', tempPath],
    { onLog, label: 'image-bake-opacity', encoderFallback: false },
  );
  await fs.rename(tempPath, outputPath);
}

/**
 * Bake global opacity into a video with alpha (qtrle/ARGB) for cheap overlay at merge.
 */
export async function bakeVideoWithOpacity(
  inputPath: string,
  outputPath: string,
  opacity: number,
  onLog?: (msg: string) => void,
): Promise<void> {
  const vf = `format=rgba,colorchannelmixer=aa=${opacity}`;
  const tempPath = `${outputPath}.tmp.mov`;
  await runFfmpeg(
    ['-y', '-i', inputPath, '-vf', vf, '-an', '-c:v', 'qtrle', '-pix_fmt', 'argb', tempPath],
    { onLog, label: 'video-bake-opacity', encodeOpts: { preset: 'fast' } },
  );
  await fs.rename(tempPath, outputPath);
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
