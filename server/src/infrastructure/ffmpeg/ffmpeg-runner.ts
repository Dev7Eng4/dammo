import { spawn } from 'node:child_process';
import path from 'node:path';
import { env } from '../../config/env.js';
import { ffmpegPresets, type FfmpegPresetKey } from './ffmpeg-presets.js';

export interface FfmpegProgress {
  progress: number;
  eta: string;
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
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export async function runFfmpegJob(
  inputPath: string,
  outputPath: string,
  preset: FfmpegPresetKey = 'default',
  onProgress?: (progress: FfmpegProgress) => void,
): Promise<void> {
  const presetConfig = ffmpegPresets[preset] ?? ffmpegPresets.default;
  const args = ['-y', '-i', inputPath, ...presetConfig.args, outputPath];

  return new Promise((resolve, reject) => {
    const proc = spawn(env.ffmpegPath, args);
    let durationSec = 0;

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
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

    proc.on('close', (code) => {
      if (code === 0) {
        onProgress?.({ progress: 100, eta: '00:00:00' });
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`FFmpeg not available: ${err.message}`));
    });
  });
}

export function resolveOutputPath(fileName: string, outputDir: string): string {
  const base = path.basename(fileName, path.extname(fileName));
  return path.join(outputDir, `${base}_rendered.mp4`);
}
