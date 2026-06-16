export const ffmpegPresets = {
  tiktok_vertical: {
    label: 'TikTok Vertical 1080x1920',
    args: ['-vf', 'scale=1080:1920', '-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac'],
  },
  youtube_shorts: {
    label: 'YouTube Shorts 1080x1920',
    args: ['-vf', 'scale=1080:1920', '-c:v', 'libx264', '-preset', 'medium', '-c:a', 'aac'],
  },
  default: {
    label: 'Default H.264',
    args: ['-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac'],
  },
} as const;

export type FfmpegPresetKey = keyof typeof ffmpegPresets;
