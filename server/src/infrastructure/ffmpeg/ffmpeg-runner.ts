import { spawn } from 'node:child_process';
import path from 'node:path';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';
import { buildFfmpegCommandLog, emitFfmpegCommandLog } from './ffmpeg-command.js';
import {
  buildCpuEncoderFallbackArgs,
  isGpuEncoderFailure,
  isHardwareEncoder,
  resolveFfmpegHwEncoder,
  type H264EncodeOptions,
} from './ffmpeg-encoder.js';
import { buildPresetArgs, type FfmpegPresetKey } from './ffmpeg-presets.js';

export interface FfmpegProgress {
  progress: number;
  eta: string;
}

export interface RunFfmpegOptions {
  onProgress?: (progress: FfmpegProgress) => void;
  encoderFallback?: boolean;
  encodeOpts?: H264EncodeOptions;
  onLog?: (msg: string) => void;
  label?: string;
}

interface FfmpegRunResult {
  code: number | null;
  stderr: string;
}

function parseDurationToSeconds(duration: string): number {
  const parts = duration.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

function formatEta(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

function spawnFfmpegOnce(args: string[], onProgress?: (progress: FfmpegProgress) => void): Promise<FfmpegRunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.ffmpegPath, args);
    let durationSec = 0;
    let stderr = '';

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;

      const durationMatch = text.match(/Duration: (\d+:\d+:\d+\.\d+)/);
      if (durationMatch) {
        durationSec = parseDurationToSeconds(durationMatch[1].split('.')[0]);
      }

      const timeMatch = text.match(/time=(\d+:\d+:\d+\.\d+)/);
      if (timeMatch && durationSec > 0 && onProgress) {
        const currentSec = parseDurationToSeconds(timeMatch[1].split('.')[0]);
        const progress = Math.min(99, Math.round((currentSec / durationSec) * 100));
        const remaining = Math.max(0, durationSec - currentSec);
        onProgress({ progress, eta: formatEta(remaining) });
      }
    });

    proc.on('close', code => {
      resolve({ code, stderr });
    });

    proc.on('error', err => {
      reject(new Error(`FFmpeg not available: ${err.message}`));
    });
  });
}

async function logFfmpegCommand(args: string[], options?: RunFfmpegOptions, labelSuffix = ''): Promise<void> {
  const label = options?.label
    ? labelSuffix
      ? `${options.label} ${labelSuffix}`
      : options.label
    : labelSuffix || undefined;
  const lines = await buildFfmpegCommandLog(env.ffmpegPath, args, label);
  emitFfmpegCommandLog(lines, options?.onLog);
}

async function runFfmpegWithEncoderFallback(
  args: string[],
  options?: RunFfmpegOptions,
): Promise<void> {
  const encoderFallback = options?.encoderFallback ?? true;
  const encoder = resolveFfmpegHwEncoder();

  await logFfmpegCommand(args, options);
  const first = await spawnFfmpegOnce(args, options?.onProgress);

  if (first.code === 0) {
    options?.onProgress?.({ progress: 100, eta: '00:00:00' });
    return;
  }

  const canFallback =
    encoderFallback &&
    isHardwareEncoder(encoder) &&
    isGpuEncoderFailure(first.stderr);

  if (!canFallback) {
    throw new Error(`FFmpeg exited with code ${first.code}: ${first.stderr.slice(-800)}`);
  }

  const fallbackMsg = `[ffmpeg] GPU encode failed (${encoder}), fallback CPU: ${first.stderr.slice(-200).replace(/\s+/g, ' ').trim()}`;
  console.warn(fallbackMsg);
  options?.onLog?.(fallbackMsg);

  const fallbackArgs = await buildCpuEncoderFallbackArgs(args, options?.encodeOpts);
  await logFfmpegCommand(fallbackArgs, options, '(cpu-fallback)');
  const second = await spawnFfmpegOnce(fallbackArgs, options?.onProgress);

  if (second.code === 0) {
    options?.onProgress?.({ progress: 100, eta: '00:00:00' });
    return;
  }

  throw new Error(`FFmpeg exited with code ${second.code}: ${second.stderr.slice(-800)}`);
}

/**
 * Generic ffmpeg runner. Spawns ffmpeg with the given args, parses progress
 * from stderr and resolves/rejects on exit. Reusable across pipelines
 * (slideshow, etc.) without coupling to preset/SI-specific error codes.
 */
export async function runFfmpeg(args: string[], options?: RunFfmpegOptions | ((progress: FfmpegProgress) => void)): Promise<void> {
  const normalized: RunFfmpegOptions =
    typeof options === 'function' ? { onProgress: options } : (options ?? {});
  return runFfmpegWithEncoderFallback(args, normalized);
}

export async function runFfmpegFilterComplex(
  args: string[],
  options?: RunFfmpegOptions,
): Promise<void> {
  try {
    await runFfmpegWithEncoderFallback(args, options);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'FFmpeg filter_complex failed';
    throw new AppError(message, 502, 'SI_FFMPEG_FAILED');
  }
}

export async function runFfmpegJob(
  inputPath: string,
  outputPath: string,
  preset: FfmpegPresetKey = 'default',
  onProgress?: (progress: FfmpegProgress) => void,
): Promise<void> {
  const presetConfig = buildPresetArgs(preset);
  const args = ['-y', '-i', inputPath, ...presetConfig.args, outputPath];
  return runFfmpeg(args, { onProgress, encodeOpts: presetConfig.encodeOpts, label: `render-${preset}` });
}

export function resolveOutputPath(fileName: string, outputDir: string): string {
  const base = path.basename(fileName, path.extname(fileName));
  return path.join(outputDir, `${base}_rendered.mp4`);
}
