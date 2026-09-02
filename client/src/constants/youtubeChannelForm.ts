import type {
  UploadFrequency,
  VideoCreationOrder,
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
  value: Exclude<ReupAudioBackgroundImage, 'celebrity' | 'local_image'>;
  label: string;
}[] = [
  { value: 'no_image', label: 'Không dùng ảnh' },
  { value: 'one_image', label: 'Một ảnh' },
  { value: 'multi_image', label: 'Nhiều ảnh' },
];

export const CELEBRITY_BACKGROUND_VALUE_PREFIX = 'celebrity:';
export const CELEBRITY_EMPTY_SENTINEL = '__celebrity_empty__';

export function toCelebrityBackgroundValue(celebrityId: string): string {
  return `${CELEBRITY_BACKGROUND_VALUE_PREFIX}${celebrityId}`;
}

export function parseSiBackgroundImageValue(value: string): {
  mode: ReupAudioBackgroundImage | '';
  celebrityId?: string;
} {
  if (!value) return { mode: '' };
  if (value.startsWith(CELEBRITY_BACKGROUND_VALUE_PREFIX)) {
    const celebrityId = value.slice(CELEBRITY_BACKGROUND_VALUE_PREFIX.length);
    return celebrityId ? { mode: 'celebrity', celebrityId } : { mode: '' };
  }
  if (
    value === 'no_image' ||
    value === 'local_image' ||
    value === 'one_image' ||
    value === 'multi_image' ||
    value === 'celebrity'
  ) {
    return { mode: value };
  }
  return { mode: '' };
}

export function toSiBackgroundImageFormValue(
  mode: ReupAudioBackgroundImage | '' | undefined,
  celebrityId?: string,
): string {
  if (mode === 'celebrity' && celebrityId) return toCelebrityBackgroundValue(celebrityId);
  return mode ?? '';
}

export const CAPTION_STYLE_OPTIONS: { value: CaptionStyleKey; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'noto_sans_red_white', label: 'Noto Sans Red text + White stroke' },
  { value: 'noto_sans_red_white_box', label: 'Noto Sans Red text + White stroke + Box' },
  { value: 'noto_sans_blue_white', label: 'Noto Sans Blue text + White stroke' },
  { value: 'noto_sans_blue_white_box', label: 'Noto Sans Blue text + White stroke + Box' },
  { value: 'noto_sans_yellow', label: 'Noto Sans Yellow text' },
  { value: 'noto_sans_yellow_box', label: 'Noto Sans Yellow text + Box' },
  { value: 'noto_sans_cyan_white', label: 'Noto Sans Cyan text + White stroke' },
  { value: 'noto_sans_cyan_white_box', label: 'Noto Sans Cyan text + White stroke + Box' },
  { value: 'noto_sans_white_purple', label: 'Noto Sans White text + Purple stroke' },
  { value: 'noto_sans_white_purple_box', label: 'Noto Sans White text + Purple stroke + Box' },
  { value: 'bizudp_gothic', label: 'BIZ UDPGothic' },
  { value: 'bizudp_gothic_red_white', label: 'BIZ UDPGothic Red text + White stroke' },
  { value: 'bizudp_gothic_red_white_box', label: 'BIZ UDPGothic Red text + White stroke + Box' },
  { value: 'zen_kaku', label: 'Zen Kaku' },
  { value: 'zen_kaku_blue_white', label: 'Zen Kaku Blue text + White stroke' },
  { value: 'zen_kaku_blue_white_box', label: 'Zen Kaku Blue text + White stroke + Box' },
  { value: 'noto_serif', label: 'Noto Serif' },
  { value: 'serif_white_purple', label: 'Noto Serif White text + Purple stroke' },
  { value: 'serif_white_purple_box', label: 'Noto Serif White text + Purple stroke + Box' },
  { value: 'serif_yellow', label: 'Noto Serif Yellow text' },
  { value: 'serif_yellow_box', label: 'Noto Serif Yellow text + Box' },
  { value: 'serif_cyan_white', label: 'Noto Serif Cyan text + White stroke' },
  { value: 'serif_cyan_white_box', label: 'Noto Serif Cyan text + White stroke + Box' },
  { value: 'serif_red_white', label: 'Noto Serif Red text + White stroke' },
  { value: 'serif_red_white_box', label: 'Noto Serif Red text + White stroke + Box' },
];

export const UPLOAD_FREQUENCY_OPTIONS: { value: UploadFrequency; label: string }[] = [
  { value: 'every_5_days', label: '1 video mỗi 5 ngày' },
  { value: 'every_3_days', label: '1 video mỗi 3 ngày' },
  { value: 'every_2_days', label: '1 video mỗi 2 ngày' },
  { value: 'daily_1', label: '1 video mỗi ngày' },
  { value: 'daily_2', label: '2 video mỗi ngày' },
  { value: 'daily_3', label: '3 video mỗi ngày' },
];

export const VIDEO_CREATION_ORDER_OPTIONS: { value: VideoCreationOrder; label: string }[] = [
  { value: 'oldest_first', label: 'Từ cũ đến mới' },
  { value: 'newest_first', label: 'Từ mới đến cũ' },
  { value: 'lowest_views_first', label: 'Video view tăng dần' },
  { value: 'shortest_duration_first', label: 'Thời lượng ngắn đến dài' },
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
