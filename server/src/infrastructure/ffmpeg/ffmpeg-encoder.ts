import { env } from '../../config/env.js';

export type FfmpegHwEncoder = 'cpu' | 'intel' | 'amd' | 'nvidia';

const VALID_ENCODERS = new Set<FfmpegHwEncoder>(['cpu', 'intel', 'amd', 'nvidia']);

const ENCODER_VALUE_FLAGS = new Set([
  '-preset',
  '-crf',
  '-global_quality',
  '-quality',
  '-rc',
  '-qp_i',
  '-qp_p',
  '-cq',
  '-b:v',
]);

export interface H264EncodeOptions {
  preset?: string;
  crf?: number;
  bitrate?: string;
}

export function resolveFfmpegHwEncoder(): FfmpegHwEncoder {
  const raw = (env.ffmpegHwEncoder ?? 'cpu').toLowerCase();
  return VALID_ENCODERS.has(raw as FfmpegHwEncoder) ? (raw as FfmpegHwEncoder) : 'cpu';
}

export function isHardwareEncoder(encoder: FfmpegHwEncoder): boolean {
  return encoder !== 'cpu';
}

export function resolveOutputPixelFormat(encoder?: FfmpegHwEncoder): 'yuv420p' | 'nv12' {
  const enc = encoder ?? resolveFfmpegHwEncoder();
  return enc === 'cpu' ? 'yuv420p' : 'nv12';
}

export function appendPixelFormatToVideoFilter(filter: string, encoder?: FfmpegHwEncoder): string {
  const pixFmt = resolveOutputPixelFormat(encoder);
  const withoutFormat = filter.replace(/,format=(?:yuv420p|nv12)/g, '');
  return `${withoutFormat},format=${pixFmt}`;
}

export function buildH264VideoEncoderArgs(
  opts?: H264EncodeOptions,
  encoder?: FfmpegHwEncoder,
): string[] {
  const enc = encoder ?? resolveFfmpegHwEncoder();
  const crf = opts?.crf ?? 23;
  const preset = opts?.preset ?? 'fast';

  switch (enc) {
    case 'intel':
      return ['-c:v', 'h264_qsv', '-preset', preset, '-global_quality', String(crf)];
    case 'amd':
      return [
        '-c:v',
        'h264_amf',
        '-quality',
        'balanced',
        '-rc',
        'cqp',
        '-qp_i',
        String(crf),
        '-qp_p',
        String(crf),
      ];
    case 'nvidia': {
      const args = ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', String(crf)];
      if (opts?.bitrate) {
        args.push('-b:v', opts.bitrate);
      }
      return args;
    }
    case 'cpu':
    default: {
      const args = ['-c:v', 'libx264', '-preset', preset];
      if (opts?.crf !== undefined) {
        args.push('-crf', String(crf));
      }
      return args;
    }
  }
}

function findEncoderSectionEnd(args: string[], startIdx: number): number {
  let i = startIdx + 2;
  while (i < args.length) {
    const token = args[i];
    if (token.startsWith('-') && !ENCODER_VALUE_FLAGS.has(token)) {
      break;
    }
    if (ENCODER_VALUE_FLAGS.has(token)) {
      i += 2;
      continue;
    }
    i += 1;
  }
  return i;
}

export function replaceVideoEncoderInArgs(
  args: string[],
  encoder: FfmpegHwEncoder,
  encodeOpts?: H264EncodeOptions,
): string[] {
  const out = [...args];
  const cIdx = out.indexOf('-c:v');
  const newEncoderArgs = buildH264VideoEncoderArgs(encodeOpts, encoder);
  if (cIdx === -1) {
    return [...out, ...newEncoderArgs];
  }
  const end = findEncoderSectionEnd(out, cIdx);
  out.splice(cIdx, end - cIdx, ...newEncoderArgs);
  return out;
}

export function patchPixelFormatInArgs(args: string[], encoder: FfmpegHwEncoder): string[] {
  const pixFmt = resolveOutputPixelFormat(encoder);
  return args.map(arg => {
    if (!arg.includes('format=')) return arg;
    return arg.replace(/format=(?:nv12|yuv420p)/g, `format=${pixFmt}`);
  });
}

export function patchPixFmtFlagInArgs(args: string[], encoder: FfmpegHwEncoder): string[] {
  const pixFmt = resolveOutputPixelFormat(encoder);
  const out = [...args];
  const idx = out.indexOf('-pix_fmt');
  if (idx !== -1 && idx + 1 < out.length) {
    out[idx + 1] = pixFmt;
  }
  return out;
}

export function isGpuEncoderFailure(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return (
    lower.includes('unknown encoder') ||
    lower.includes('cannot load') ||
    lower.includes('no device') ||
    lower.includes('invalid argument') ||
    lower.includes('error while opening encoder') ||
    lower.includes('device creation failed') ||
    lower.includes('not supported') ||
    lower.includes('no capable devices')
  );
}

export async function buildCpuEncoderFallbackArgs(
  args: string[],
  encodeOpts?: H264EncodeOptions,
): Promise<string[]> {
  const fs = await import('node:fs/promises');

  let patched = replaceVideoEncoderInArgs(args, 'cpu', encodeOpts);
  patched = patchPixelFormatInArgs(patched, 'cpu');
  patched = patchPixFmtFlagInArgs(patched, 'cpu');

  const scriptIdx = patched.indexOf('-filter_complex_script');
  if (scriptIdx !== -1 && scriptIdx + 1 < patched.length) {
    const scriptPath = patched[scriptIdx + 1];
    const content = await fs.readFile(scriptPath, 'utf8');
    const cpuContent = content
      .replace(/format=nv12/g, 'format=yuv420p')
      .replace(/\[venc\]/g, '[vout_final]');
    const tempPath = `${scriptPath}.cpu_fallback.txt`;
    await fs.writeFile(tempPath, cpuContent, 'utf8');
    patched[scriptIdx + 1] = tempPath;
    patched = patched.map(arg => (arg === '[venc]' ? '[vout_final]' : arg));
  }

  return patched;
}
