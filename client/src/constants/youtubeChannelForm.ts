import type {
  UploadFrequency,
  YoutubeChannelLanguage,
  YoutubeChannelType,
  ReupAudioVideoType,
  ReupAudioBackgroundImage,
  CaptionStyleKey,
} from '../types/youtubeChannel';

export const YOUTUBE_CHANNEL_LANGUAGE_OPTIONS: { value: YoutubeChannelLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ko', label: 'Korean' },
  { value: 'ja', label: 'Japanese' },
  { value: 'es', label: 'Spanish' },
];

/** @deprecated Use YOUTUBE_CHANNEL_LANGUAGE_OPTIONS */
export const TARGET_AUDIENCE_OPTIONS = YOUTUBE_CHANNEL_LANGUAGE_OPTIONS;

export const YOUTUBE_CHANNEL_TYPE_OPTIONS: { value: YoutubeChannelType; label: string }[] = [
  { value: 'content', label: 'Content' },
  { value: 'reup_audio', label: 'Reup Audio' },
  { value: 'reup_video', label: 'Reup Video' },
  { value: 'content_sale', label: 'Content Sale' },
];

export const REUP_AUDIO_VIDEO_TYPE_OPTIONS: { value: ReupAudioVideoType; label: string }[] = [
  { value: 'si', label: 'Stock Video + Image' },
  { value: 'ai', label: 'Animate Images (AI)' },
];

export const REUP_AUDIO_BACKGROUND_IMAGE_OPTIONS: {
  value: ReupAudioBackgroundImage;
  label: string;
}[] = [
  { value: 'no_image', label: 'No Image' },
  { value: 'local_image', label: 'Local Image' },
  { value: 'one_image', label: 'One Image' },
  { value: 'multi_image', label: 'Multi Image' },
];

export const CAPTION_STYLE_OPTIONS: { value: CaptionStyleKey; label: string }[] = [
  { value: 'default', label: 'Default (Noto Sans, trắng)' },
  { value: 'bizudp_gothic', label: 'BIZ UDPGothic' },
  { value: 'zen_kaku', label: 'Zen Kaku Gothic New' },
  { value: 'noto_serif', label: 'Noto Serif JP' },
  { value: 'cyan', label: 'Cyan text' },
  { value: 'cyan_navy', label: 'Cyan + Navy stroke' },
  { value: 'yellow', label: 'Yellow text' },
];

export const UPLOAD_FREQUENCY_OPTIONS: { value: UploadFrequency; label: string }[] = [
  { value: 'every_5_days', label: '1 video every 5 days' },
  { value: 'every_3_days', label: '1 video every 3 days' },
  { value: 'every_2_days', label: '1 video every 2 days' },
  { value: 'daily_1', label: '1 video per day' },
  { value: 'daily_2', label: '2 videos per day' },
  { value: 'daily_3', label: '3 videos per day' },
];

export function getPublishTimeSlotCount(frequency: UploadFrequency | ''): number {
  switch (frequency) {
    case 'daily_2':
      return 2;
    case 'daily_3':
      return 3;
    case 'every_5_days':
    case 'every_3_days':
    case 'every_2_days':
    case 'daily_1':
      return 1;
    default:
      return 0;
  }
}

export function buildUploadScheduleLabel(frequency: UploadFrequency, times: string[]): string {
  const formattedTimes = times.join(', ');
  switch (frequency) {
    case 'every_5_days':
      return `1 video every 5 days at ${formattedTimes}`;
    case 'every_3_days':
      return `1 video every 3 days at ${formattedTimes}`;
    case 'every_2_days':
      return `1 video every 2 days at ${formattedTimes}`;
    case 'daily_1':
      return `1 video per day at ${formattedTimes}`;
    case 'daily_2':
      return `2 videos per day at ${formattedTimes}`;
    case 'daily_3':
      return `3 videos per day at ${formattedTimes}`;
    default:
      return formattedTimes;
  }
}

export function createEmptyPublishTimes(count: number): string[] {
  return Array.from({ length: count }, () => '');
}

export function getChannelUploadTimes(channel: {
  uploadSchedule?: string[] | string;
}): string[] {
  if (Array.isArray(channel.uploadSchedule)) {
    return channel.uploadSchedule;
  }
  if (typeof channel.uploadSchedule === 'string') {
    const matches = channel.uploadSchedule.match(/\d{2}:\d{2}/g);
    return matches ?? [];
  }
  return [];
}

export function formatChannelUploadSchedule(channel: {
  uploadFrequency?: UploadFrequency;
  uploadSchedule?: string[] | string;
}): string {
  const times = getChannelUploadTimes(channel);
  if (times.length === 0) return '';
  if (channel.uploadFrequency) {
    return buildUploadScheduleLabel(channel.uploadFrequency, times);
  }
  return times.join(', ');
}
