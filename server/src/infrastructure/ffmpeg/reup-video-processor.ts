import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../shared/http/errors.js';
import {
  appendPixelFormatToVideoFilter,
  buildH264VideoEncoderArgs,
} from './ffmpeg-encoder.js';
import { runFfmpeg } from './ffmpeg-runner.js';
import { buildReupVideoFilterGraph } from './reup-video-filters.js';

export interface ProcessReupVideoOptions {
  onStderrLine?: (line: string) => void;
}

export async function processReupVideo(
  inputPath: string,
  outputPath: string,
  options?: ProcessReupVideoOptions,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const filterGraph = appendPixelFormatToVideoFilter(buildReupVideoFilterGraph());
  const encodeOpts = { preset: 'fast' as const };
  const args = [
    '-y',
    '-i',
    inputPath,
    '-vf',
    filterGraph,
    ...buildH264VideoEncoderArgs(encodeOpts),
    '-c:a',
    'aac',
    outputPath,
  ];

  try {
    await runFfmpeg(args, { encodeOpts, label: 'reup-process' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'FFmpeg reup processing failed';
    throw new AppError(message, 502, 'FFMPEG_REUP_FAILED');
  }

  if (options?.onStderrLine) {
    options.onStderrLine('[reup-video] encode complete');
  }
}

export function buildReupOutputPath(channelId: string, videoId: string, outputDir: string): string {
  return path.join(outputDir, `${channelId}_${videoId}_reup.mp4`);
}
