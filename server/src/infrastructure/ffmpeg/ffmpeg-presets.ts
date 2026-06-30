import {
  appendPixelFormatToVideoFilter,
  buildH264VideoEncoderArgs,
  resolveFfmpegHwEncoder,
  resolveOutputPixelFormat,
  type H264EncodeOptions,
} from './ffmpeg-encoder.js';

export const ffmpegPresets = {
  tiktok_vertical: {
    label: 'TikTok Vertical 1080x1920',
    preset: 'fast' as const,
    scale: '1080:1920',
  },
  youtube_shorts: {
    label: 'YouTube Shorts 1080x1920',
    preset: 'medium' as const,
    scale: '1080:1920',
  },
  default: {
    label: 'Default H.264',
    preset: 'fast' as const,
  },
} as const;

export type FfmpegPresetKey = keyof typeof ffmpegPresets;

export function buildPresetArgs(key: FfmpegPresetKey): { args: string[]; encodeOpts: H264EncodeOptions } {
  const preset = ffmpegPresets[key] ?? ffmpegPresets.default;
  const encodeOpts: H264EncodeOptions = { preset: preset.preset };
  const encoder = resolveFfmpegHwEncoder();
  const pixFmt = resolveOutputPixelFormat(encoder);

  const vfParts: string[] = [];
  if ('scale' in preset && preset.scale) {
    vfParts.push(`scale=${preset.scale}`);
  }
  vfParts.push(`format=${pixFmt}`);

  const args = [
    '-vf',
    vfParts.join(','),
    ...buildH264VideoEncoderArgs(encodeOpts),
    '-c:a',
    'aac',
  ];

  return { args, encodeOpts };
}
