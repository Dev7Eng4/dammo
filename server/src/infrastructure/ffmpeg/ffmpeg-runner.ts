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
  time?: string;
  fps?: number;
  bitrate?: string;
  speed?: string;
  frame?: number;
  size?: string;
}

export interface RunFfmpegOptions {
  onProgress?: (progress: FfmpegProgress) => void;
  /** Override Duration parsed from input (e.g. when output is trimmed with -t). */
  expectedDurationSec?: number;
  encoderFallback?: boolean;
  encodeOpts?: H264EncodeOptions;
  onLog?: (msg: string) => void;
  label?: string;
  /**
   * Kill ffmpeg after this many ms without encoding progress (`time=`).
   * `0` disables. When omitted, scales with `expectedDurationSec` when set.
   */
  stallTimeoutMs?: number;
}

interface FfmpegRunResult {
  code: number | null;
  stderr: string;
  /** True when the process was killed because it stopped producing progress. */
  stalled?: boolean;
  elapsedMs: number;
  mediaTimeSec: number;
  lastProgress?: ParsedFfmpegProgressLine;
}

interface ParsedFfmpegProgressLine {
  frame?: number;
  fps?: number;
  size?: string;
  time?: string;
  bitrate?: string;
  speed?: string;
}

const FFMPEG_PROGRESS_RE =
  /frame=\s*(\d+)\s+fps=\s*([\d.]+)\s+q=[\d.-]+\s+size=\s*(\S+)\s+time=(\d+:\d+:\d+\.\d+)\s+bitrate=\s*(\S+)\s+speed=\s*([\d.]+x)/;

const PROGRESS_LOG_INTERVAL_MS = 2000;
/**
 * Hardware encoders (notably AMF) can finish writing output and then never exit,
 * which would block the caller forever since we only resolve on `close`.
 */
const FFMPEG_STALL_TIMEOUT_MS = 120_000;
const FFMPEG_STALL_TIMEOUT_MAX_MS = 30 * 60_000;
/** Keep a sliding window of stderr — full concat can OOM on long encodes. */
const STDERR_MAX_CHARS = 256 * 1024;

const QUIET_LOG_LEVELS = new Set(['quiet', 'panic', 'fatal', 'error']);

function appendCappedStderr(current: string, chunk: string, maxChars = STDERR_MAX_CHARS): string {
  const next = current + chunk;
  if (next.length <= maxChars) return next;
  return next.slice(next.length - maxChars);
}

function parseDurationToSeconds(duration: string): number {
  const parts = duration.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

function formatElapsedSeconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function emitFfmpegSummary(
  options: RunFfmpegOptions | undefined,
  result: FfmpegRunResult,
  encoder: string,
): void {
  const label = options?.label ? ` ${options.label}` : '';
  const durationSec = options?.expectedDurationSec ?? result.mediaTimeSec;
  const averageSpeed = result.elapsedMs > 0 && durationSec > 0
    ? durationSec / (result.elapsedMs / 1000)
    : 0;
  const parts = [
    `[ffmpeg]${label} completed`,
    `wall=${formatElapsedSeconds(result.elapsedMs)}`,
    durationSec > 0 ? `media=${durationSec.toFixed(1)}s` : '',
    averageSpeed > 0 ? `avg-speed=${averageSpeed.toFixed(2)}x` : '',
    result.lastProgress?.fps !== undefined ? `last-fps=${result.lastProgress.fps}` : '',
    `encoder=${encoder}`,
  ].filter(Boolean);
  const message = parts.join(' | ');
  console.log(message);
  options?.onLog?.(message);
}

function formatEta(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

function parseFfmpegProgressLine(text: string): ParsedFfmpegProgressLine | null {
  const match = text.match(FFMPEG_PROGRESS_RE);
  if (!match) return null;
  return {
    frame: Number(match[1]),
    fps: Number(match[2]),
    size: match[3],
    time: match[4],
    bitrate: match[5],
    speed: match[6],
  };
}

function formatFfmpegProgressLog(label: string | undefined, progress: FfmpegProgress): string {
  const prefix = label ? `[ffmpeg] ${label}` : '[ffmpeg]';
  const parts = [`${prefix} ${progress.progress}%`];
  if (progress.time) parts.push(`time=${progress.time}`);
  if (progress.bitrate) parts.push(`bitrate=${progress.bitrate}`);
  if (progress.speed) parts.push(`speed=${progress.speed}`);
  if (progress.fps !== undefined) parts.push(`fps=${progress.fps}`);
  return parts.join(' | ');
}

function emitFfmpegProgressLog(
  options: RunFfmpegOptions | undefined,
  progress: FfmpegProgress,
  state: { lastLoggedProgress: number; lastLoggedAt: number },
  force = false,
): void {
  const now = Date.now();
  const shouldLog =
    force ||
    progress.progress === 100 ||
    state.lastLoggedProgress < 0 ||
    Math.abs(progress.progress - state.lastLoggedProgress) >= 1 ||
    now - state.lastLoggedAt >= PROGRESS_LOG_INTERVAL_MS;

  if (!shouldLog) return;

  const msg = formatFfmpegProgressLog(options?.label, progress);
  console.log(msg);
  options?.onLog?.(msg);
  state.lastLoggedProgress = progress.progress;
  state.lastLoggedAt = now;
}

function buildProgressFromTime(
  time: string,
  durationSec: number,
  parsed?: ParsedFfmpegProgressLine | null,
): FfmpegProgress | null {
  if (durationSec <= 0) return null;

  const currentSec = parseDurationToSeconds(time.split('.')[0]);
  const progress = Math.min(99, Math.round((currentSec / durationSec) * 100));
  const remaining = Math.max(0, durationSec - currentSec);

  return {
    progress,
    eta: formatEta(remaining),
    time,
    fps: parsed?.fps,
    bitrate: parsed?.bitrate,
    speed: parsed?.speed,
    frame: parsed?.frame,
    size: parsed?.size,
  };
}

/**
 * Base 120s; when expectedDurationSec is known, allow longer silence of progress
 * up to 30m so long encodes are not false-stalled.
 */
export function resolveFfmpegStallTimeoutMs(options?: RunFfmpegOptions): number {
  if (options?.stallTimeoutMs !== undefined) {
    return options.stallTimeoutMs;
  }

  const expected = options?.expectedDurationSec;
  if (typeof expected === 'number' && Number.isFinite(expected) && expected > 0) {
    return Math.max(FFMPEG_STALL_TIMEOUT_MS, Math.min(FFMPEG_STALL_TIMEOUT_MAX_MS, expected * 2000));
  }

  return FFMPEG_STALL_TIMEOUT_MS;
}

/**
 * Ensure ffmpeg emits encoding progress on stderr when the stall watchdog is on.
 * Callers often pass `-loglevel error`, which suppresses `time=` stats and causes
 * false stalls on long jobs.
 */
export function ensureFfmpegProgressLoggingArgs(args: string[]): string[] {
  const out = [...args];

  for (let i = 0; i < out.length - 1; i += 1) {
    if (out[i] !== '-loglevel') continue;
    const level = String(out[i + 1] ?? '').toLowerCase();
    if (QUIET_LOG_LEVELS.has(level)) {
      out[i + 1] = 'info';
    }
  }

  const noStatsIdx = out.indexOf('-nostats');
  if (noStatsIdx >= 0) {
    out.splice(noStatsIdx, 1);
  }

  if (!out.includes('-stats')) {
    const hideBannerIdx = out.indexOf('-hide_banner');
    if (hideBannerIdx >= 0) {
      out.splice(hideBannerIdx + 1, 0, '-stats');
    } else {
      out.unshift('-stats');
    }
  }

  return out;
}

function spawnFfmpegOnce(args: string[], options?: RunFfmpegOptions): Promise<FfmpegRunResult> {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const proc = spawn(env.ffmpegPath, args);
    let durationSec = 0;
    let stderr = '';
    let stalled = false;
    let mediaTimeSec = 0;
    let lastProgress: ParsedFfmpegProgressLine | undefined;
    const logState = { lastLoggedProgress: -1, lastLoggedAt: 0 };

    const stallTimeoutMs = resolveFfmpegStallTimeoutMs(options);
    let stallTimer: NodeJS.Timeout | undefined;

    const clearStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = undefined;
    };

    const armStallTimer = () => {
      if (stallTimeoutMs <= 0) return;
      clearStallTimer();
      stallTimer = setTimeout(() => {
        stalled = true;
        const msg =
          `[ffmpeg]${options?.label ? ` ${options.label}` : ''} no progress for ` +
          `${Math.round(stallTimeoutMs / 1000)}s, killing stalled process`;
        console.warn(msg);
        options?.onLog?.(msg);
        proc.kill('SIGKILL');
      }, stallTimeoutMs);
    };

    // Wait for first encoding progress (or kill if none arrives in time).
    armStallTimer();

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr = appendCappedStderr(stderr, text);

      const durationMatch = text.match(/Duration: (\d+:\d+:\d+\.\d+)/);
      if (durationMatch) {
        durationSec = parseDurationToSeconds(durationMatch[1].split('.')[0]);
      }

      const parsed = parseFfmpegProgressLine(text);
      const time = parsed?.time ?? text.match(/time=(\d+:\d+:\d+\.\d+)/)?.[1];
      if (!time) return;
      mediaTimeSec = parseDurationToSeconds(time);
      if (parsed) lastProgress = parsed;

      // Only real encode progress resets the stall watchdog.
      armStallTimer();

      const effectiveDurationSec = options?.expectedDurationSec ?? durationSec;
      const progress = buildProgressFromTime(time, effectiveDurationSec, parsed);
      if (!progress) return;

      options?.onProgress?.(progress);
      emitFfmpegProgressLog(options, progress, logState);
    });

    proc.on('close', code => {
      clearStallTimer();
      resolve({
        code,
        stderr: stalled ? `${stderr}\nffmpeg stalled with no progress and was killed` : stderr,
        stalled,
        elapsedMs: performance.now() - startedAt,
        mediaTimeSec,
        ...(lastProgress ? { lastProgress } : {}),
      });
    });

    proc.on('error', err => {
      clearStallTimer();
      reject(new Error(`FFmpeg not available: ${err.message}`));
    });
  });
}

function completeFfmpegProgress(options?: RunFfmpegOptions): void {
  const progress: FfmpegProgress = { progress: 100, eta: '00:00:00' };
  options?.onProgress?.(progress);
  emitFfmpegProgressLog(options, progress, { lastLoggedProgress: -1, lastLoggedAt: 0 }, true);
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
  const stallTimeoutMs = resolveFfmpegStallTimeoutMs(options);
  const effectiveOptions: RunFfmpegOptions = { ...options, stallTimeoutMs };
  const effectiveArgs =
    stallTimeoutMs > 0 ? ensureFfmpegProgressLoggingArgs(args) : args;

  await logFfmpegCommand(effectiveArgs, effectiveOptions);
  const first = await spawnFfmpegOnce(effectiveArgs, effectiveOptions);

  if (first.code === 0) {
    completeFfmpegProgress(effectiveOptions);
    emitFfmpegSummary(effectiveOptions, first, encoder);
    return;
  }

  const canFallback =
    encoderFallback &&
    isHardwareEncoder(encoder) &&
    (first.stalled === true || isGpuEncoderFailure(first.stderr));

  if (!canFallback) {
    throw new Error(`FFmpeg exited with code ${first.code}: ${first.stderr.slice(-800)}`);
  }

  const reason = first.stalled ? 'stalled' : 'failed';
  const fallbackMsg = `[ffmpeg] GPU encode ${reason} (${encoder}), fallback CPU: ${first.stderr.slice(-200).replace(/\s+/g, ' ').trim()}`;
  console.warn(fallbackMsg);
  options?.onLog?.(fallbackMsg);

  const fallbackArgsRaw = await buildCpuEncoderFallbackArgs(effectiveArgs, options?.encodeOpts);
  const fallbackArgs =
    stallTimeoutMs > 0 ? ensureFfmpegProgressLoggingArgs(fallbackArgsRaw) : fallbackArgsRaw;
  await logFfmpegCommand(fallbackArgs, effectiveOptions, '(cpu-fallback)');
  const second = await spawnFfmpegOnce(fallbackArgs, effectiveOptions);

  if (second.code === 0) {
    completeFfmpegProgress(effectiveOptions);
    emitFfmpegSummary(effectiveOptions, second, 'cpu-fallback');
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
