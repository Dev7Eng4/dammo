import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env.js';

let cachedLocation: string | undefined;

function isFfmpegBinary(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  return base === 'ffmpeg' || base === 'ffmpeg.exe';
}

function directoryHasFfmpeg(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, 'ffmpeg.exe')) ||
    fs.existsSync(path.join(dir, 'ffmpeg')) ||
    fs.existsSync(path.join(dir, 'ffprobe.exe')) ||
    fs.existsSync(path.join(dir, 'ffprobe'))
  );
}

function resolveFromPath(): string | null {
  try {
    const command = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
    const output = execSync(command, { encoding: 'utf8' }).trim();
    const firstMatch = output.split(/\r?\n/).find(Boolean);
    if (!firstMatch) return null;

    const ffmpegPath = firstMatch.trim();
    if (!fs.existsSync(ffmpegPath)) return null;

    return path.dirname(ffmpegPath);
  } catch {
    return null;
  }
}

export function resolveFfmpegLocation(): string {
  if (cachedLocation) return cachedLocation;

  const configured = env.ffmpegPath.trim();

  if (configured) {
    if (directoryHasFfmpeg(configured)) {
      cachedLocation = configured;
      return configured;
    }

    if (isFfmpegBinary(configured) && fs.existsSync(configured)) {
      cachedLocation = path.dirname(configured);
      return cachedLocation;
    }
  }

  const fromPath = resolveFromPath();
  if (fromPath) {
    cachedLocation = fromPath;
    return fromPath;
  }

  throw new Error(
    'ffmpeg not found. Install ffmpeg or set FFMPEG_PATH to the ffmpeg binary or its bin folder.',
  );
}
