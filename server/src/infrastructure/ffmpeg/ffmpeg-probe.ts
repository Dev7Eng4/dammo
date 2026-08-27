import { spawn } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';
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

interface FfprobeRun {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runFfprobeRaw(args: string[]): Promise<FfprobeRun> {
  const ffprobePath = resolveFfprobePath();

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const proc = spawn(ffprobePath, args);

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('close', code => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? -1 });
    });

    proc.on('error', err => {
      reject(new Error(`ffprobe not available: ${err.message}`));
    });
  });
}

async function runFfprobe(args: string[]): Promise<string> {
  const { stdout, exitCode } = await runFfprobeRaw(args);
  if (exitCode !== 0) {
    throw new Error(`ffprobe exited with code ${exitCode}`);
  }
  return stdout;
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

/**
 * Duration derived from the packets actually present in the file, as opposed to
 * the container header. A download that was cut short keeps the original header
 * (`getAudioDurationSeconds` happily reports the full length) while the payload
 * stops early, so this is the only figure that exposes truncation.
 *
 * Demux only, no decoding, so it stays cheap even on long files.
 */
export async function getDecodedAudioDurationSeconds(filePath: string): Promise<number> {
  const { stdout } = await runFfprobeRaw([
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'packet=pts_time,duration_time',
    '-of',
    'csv=p=0',
    filePath,
  ]);

  const lines = stdout.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const [ptsRaw, durRaw] = lines[i]!.split(',');
    const pts = Number.parseFloat(ptsRaw ?? '');
    if (!Number.isFinite(pts)) continue;

    const dur = Number.parseFloat(durRaw ?? '');
    return pts + (Number.isFinite(dur) ? dur : 0);
  }

  return 0;
}

/** ffprobe wording for a payload that ends before the header says it should. */
const TRUNCATION_MARKERS = ['partial file', 'moov atom not found', 'invalid data found when processing input'];

export interface MediaCompletenessOptions {
  /** Name used in the error message; defaults to the file's basename. */
  label?: string;
  /** Absolute slack, in seconds, on top of the relative one. */
  toleranceSec?: number;
  /** Relative slack as a fraction of the header duration. */
  toleranceRatio?: number;
}

/**
 * Rejects media files whose payload is shorter than their header claims.
 *
 * Downloaders previously only checked that the file existed, so a stream that
 * stopped early still passed and silently produced a video with minutes of
 * silence. Throwing here lets the retry/fallback chain re-attempt the download.
 */
export async function assertMediaFileComplete(
  filePath: string,
  options: MediaCompletenessOptions = {},
): Promise<void> {
  const label = options.label ?? path.basename(filePath);
  const toleranceSec = options.toleranceSec ?? 3;
  const toleranceRatio = options.toleranceRatio ?? 0.03;

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(filePath);
  } catch {
    throw new AppError(`${label} không tồn tại: ${filePath}`, 502, 'MEDIA_FILE_INCOMPLETE');
  }

  if (stat.size === 0) {
    throw new AppError(`${label} rỗng (0 byte)`, 502, 'MEDIA_FILE_INCOMPLETE');
  }

  const { stderr } = await runFfprobeRaw(['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath]);
  const marker = TRUNCATION_MARKERS.find(m => stderr.toLowerCase().includes(m));
  if (marker) {
    throw new AppError(
      `${label} hỏng hoặc tải thiếu (ffprobe: "${marker}"), ${stat.size} byte`,
      502,
      'MEDIA_FILE_INCOMPLETE',
    );
  }

  const headerDuration = await getMediaDurationSeconds(filePath);
  if (headerDuration <= 0) {
    throw new AppError(`${label} không đọc được duration, ${stat.size} byte`, 502, 'MEDIA_FILE_INCOMPLETE');
  }

  const decodedDuration = await getDecodedAudioDurationSeconds(filePath);
  if (decodedDuration <= 0) {
    throw new AppError(`${label} không có packet audio nào, ${stat.size} byte`, 502, 'MEDIA_FILE_INCOMPLETE');
  }

  // Only a payload shorter than the header is a problem; headers routinely
  // underestimate VBR streams.
  const missing = headerDuration - decodedDuration;
  const allowed = Math.max(toleranceSec, headerDuration * toleranceRatio);
  if (missing > allowed) {
    throw new AppError(
      `${label} tải thiếu: header ${formatClockDuration(headerDuration)} nhưng chỉ có ` +
        `${formatClockDuration(decodedDuration)} dữ liệu (thiếu ${Math.round(missing)}s, ${stat.size} byte)`,
      502,
      'MEDIA_FILE_INCOMPLETE',
    );
  }
}
