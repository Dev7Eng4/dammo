import type {
  UploadFrequency,
  YoutubeChannelLanguage,
  YoutubeChannelType,
  ReupAudioVideoType,
  ReupAudioBackgroundImage,
  CaptionStyleKey,
} from '../types/youtubeChannel';

export const YOUTUBE_CHANNEL_LANGUAGE_OPTIONS: { value: YoutubeChannelLanguage; label: string }[] = [
  { value: 'en', label: 'Tiếng Anh' },
  { value: 'ko', label: 'Tiếng Hàn' },
  { value: 'ja', label: 'Tiếng Nhật' },
  { value: 'es', label: 'Tiếng Tây Ban Nha' },
];

/** @deprecated Use YOUTUBE_CHANNEL_LANGUAGE_OPTIONS */
export const TARGET_AUDIENCE_OPTIONS = YOUTUBE_CHANNEL_LANGUAGE_OPTIONS;

export const YOUTUBE_CHANNEL_TYPE_OPTIONS: { value: YoutubeChannelType; label: string }[] = [
  { value: 'content', label: 'Nội dung' },
  { value: 'reup_audio', label: 'Đăng lại âm thanh' },
  { value: 'reup_video', label: 'Đăng lại video' },
];

export const REUP_AUDIO_VIDEO_TYPE_OPTIONS: { value: ReupAudioVideoType; label: string }[] = [
  { value: 'si', label: 'Video kho + hình ảnh' },
  { value: 'ai', label: 'Tạo chuyển động cho ảnh (AI)' },
];

export const REUP_AUDIO_BACKGROUND_IMAGE_OPTIONS: {
  value: ReupAudioBackgroundImage;
  label: string;
}[] = [
  { value: 'no_image', label: 'Không dùng ảnh' },
  { value: 'local_image', label: 'Ảnh cục bộ' },
  { value: 'one_image', label: 'Một ảnh' },
  { value: 'multi_image', label: 'Nhiều ảnh' },
];

export const CAPTION_STYLE_OPTIONS: { value: CaptionStyleKey; label: string }[] = [
  { value: 'default', label: 'Mặc định (Noto Sans, trắng)' },
  { value: 'bizudp_gothic', label: 'BIZ UDPGothic' },
  { value: 'zen_kaku', label: 'Zen Kaku Gothic New' },
  { value: 'noto_serif', label: 'Noto Serif JP' },
  { value: 'cyan', label: 'Chữ xanh lơ' },
  { value: 'cyan_navy', label: 'Chữ xanh lơ + viền xanh đậm' },
  { value: 'yellow', label: 'Chữ vàng' },
];

export const UPLOAD_FREQUENCY_OPTIONS: { value: UploadFrequency; label: string }[] = [
  { value: 'every_5_days', label: '1 video mỗi 5 ngày' },
  { value: 'every_3_days', label: '1 video mỗi 3 ngày' },
  { value: 'every_2_days', label: '1 video mỗi 2 ngày' },
  { value: 'daily_1', label: '1 video mỗi ngày' },
  { value: 'daily_2', label: '2 video mỗi ngày' },
  { value: 'daily_3', label: '3 video mỗi ngày' },
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
      return `1 video mỗi 5 ngày lúc ${formattedTimes}`;
    case 'every_3_days':
      return `1 video mỗi 3 ngày lúc ${formattedTimes}`;
    case 'every_2_days':
      return `1 video mỗi 2 ngày lúc ${formattedTimes}`;
    case 'daily_1':
      return `1 video mỗi ngày lúc ${formattedTimes}`;
    case 'daily_2':
      return `2 video mỗi ngày lúc ${formattedTimes}`;
    case 'daily_3':
      return `3 video mỗi ngày lúc ${formattedTimes}`;
    default:
      return formattedTimes;
  }
}

export function createEmptyPublishTimes(count: number): string[] {
  return Array.from({ length: count }, () => '');
}

export function getChannelUploadTimes(channel: { uploadSchedule?: string[] | string }): string[] {
  if (Array.isArray(channel.uploadSchedule)) {
    return channel.uploadSchedule;
  }
  if (typeof channel.uploadSchedule === 'string') {
    const matches = channel.uploadSchedule.match(/\d{2}:\d{2}/g);
    return matches ?? [];
  }
  return [];
}

export function formatChannelUploadSchedule(channel: { uploadFrequency?: UploadFrequency; uploadSchedule?: string[] | string }): string {
  const times = getChannelUploadTimes(channel);
  if (times.length === 0) return '';
  if (channel.uploadFrequency) {
    return buildUploadScheduleLabel(channel.uploadFrequency, times);
  }
  return times.join(', ');
}
