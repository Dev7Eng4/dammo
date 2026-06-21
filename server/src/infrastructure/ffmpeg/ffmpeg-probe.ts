import { spawn } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { resolveFfmpegLocation } from './ffmpeg-location.js';

const mediaDurationCache = new Map<string, number>();

function resolveFfprobePath(): string {
  const configured = env.ffmpegPath.trim();
  if (configured) {
    const probeInDir = path.join(configured, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
    if (fsSync.existsSync(probeInDir)) return probeInDir;

    if (/ffmpeg(\.exe)?$/i.test(configured)) {
      const sibling = configured.replace(/ffmpeg(\.exe)?$/i, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
      if (fsSync.existsSync(sibling)) return sibling;
    }
  }

  const ffmpegDir = resolveFfmpegLocation();
  return path.join(ffmpegDir, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
}

async function runFfprobe(args: string[]): Promise<string> {
  const ffprobePath = resolveFfprobePath();

  return new Promise((resolve, reject) => {
    let stdout = '';
    const proc = spawn(ffprobePath, args);

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.on('close', code => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`ffprobe exited with code ${code}`));
    });

    proc.on('error', err => {
      reject(new Error(`ffprobe not available: ${err.message}`));
    });
  });
}

export async function getMediaDurationSeconds(filePath: string): Promise<number> {
  const stat = await fs.stat(filePath);
  const cacheKey = `fmt:${filePath}:${stat.mtimeMs}:${stat.size}`;
  const cached = mediaDurationCache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const stdout = await runFfprobe([
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const dur = Number.parseFloat(stdout) || 0;
    mediaDurationCache.set(cacheKey, dur);
    return dur;
  } catch {
    return 0;
  }
}

export async function getAudioDurationSeconds(filePath: string): Promise<number> {
  const stat = await fs.stat(filePath);
  const cacheKey = `a0:${filePath}:${stat.mtimeMs}:${stat.size}`;
  const cached = mediaDurationCache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const stdout = await runFfprobe([
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const streamDur = Number.parseFloat(stdout);
    if (Number.isFinite(streamDur) && streamDur > 0) {
      mediaDurationCache.set(cacheKey, streamDur);
      return streamDur;
    }
  } catch {
    // fallback below
  }

  const fallback = await getMediaDurationSeconds(filePath);
  mediaDurationCache.set(cacheKey, fallback);
  return fallback;
}

export function formatClockDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '?';
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
