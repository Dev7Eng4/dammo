import type {
  UploadFrequency,
  VideoCreationOrder,
  YoutubeChannelLanguage,
  YoutubeChannelType,
  ReupAudioVideoType,
  ReupAudioBackgroundImage,
  CaptionStyleKey,
} from '../types/youtubeChannel';
import i18n from '../i18n'

export const YOUTUBE_CHANNEL_LANGUAGE_OPTIONS: { value: YoutubeChannelLanguage }[] = [
  { value: 'en' },
  { value: 'ko' },
  { value: 'ja' },
  { value: 'es' },
];

export const YOUTUBE_CHANNEL_TYPE_OPTIONS: { value: YoutubeChannelType }[] = [
  { value: 'content' },
  { value: 'reup_audio' },
  { value: 'reup_video' },
  { value: 'remake_video' },
];

export const REUP_AUDIO_VIDEO_TYPE_OPTIONS: { value: ReupAudioVideoType }[] = [
  { value: 'si' },
  { value: 'ai' },
  { value: 'ai_full_video' },
  { value: 'ai_intro_video' },
  { value: 'ai_interleaved_video' },
];

/** Video types that build scenes from AI images (the plain `ai` flow and the video variants). */
export function isAiSceneVideoType(videoType: string | undefined): boolean {
  return (
    videoType === 'ai' ||
    videoType === 'ai_full_video' ||
    videoType === 'ai_intro_video' ||
    videoType === 'ai_interleaved_video'
  );
}

export const REUP_AUDIO_BACKGROUND_IMAGE_OPTIONS: {
  value: Exclude<ReupAudioBackgroundImage, 'celebrity' | 'local_image'>;
}[] = [
  { value: 'no_image' },
  { value: 'one_image' },
  { value: 'multi_image' },
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

export const CAPTION_STYLE_OPTIONS: { value: CaptionStyleKey }[] = [
  { value: 'none' },
  { value: 'default' },
  { value: 'noto_sans_red_white' },
  { value: 'noto_sans_red_white_box' },
  { value: 'noto_sans_blue_white' },
  { value: 'noto_sans_blue_white_box' },
  { value: 'noto_sans_yellow' },
  { value: 'noto_sans_yellow_box' },
  { value: 'noto_sans_cyan_white' },
  { value: 'noto_sans_cyan_white_box' },
  { value: 'noto_sans_white_purple' },
  { value: 'noto_sans_white_purple_box' },
  { value: 'bizudp_gothic' },
  { value: 'bizudp_gothic_red_white' },
  { value: 'bizudp_gothic_red_white_box' },
  { value: 'zen_kaku' },
  { value: 'zen_kaku_blue_white' },
  { value: 'zen_kaku_blue_white_box' },
  { value: 'noto_serif' },
  { value: 'serif_white_purple' },
  { value: 'serif_white_purple_box' },
  { value: 'serif_yellow' },
  { value: 'serif_yellow_box' },
  { value: 'serif_cyan_white' },
  { value: 'serif_cyan_white_box' },
  { value: 'serif_red_white' },
  { value: 'serif_red_white_box' },
];

export const UPLOAD_FREQUENCY_OPTIONS: { value: UploadFrequency }[] = [
  { value: 'every_5_days' },
  { value: 'every_3_days' },
  { value: 'every_2_days' },
  { value: 'daily_1' },
  { value: 'daily_2' },
  { value: 'daily_3' },
];

export const VIDEO_CREATION_ORDER_OPTIONS: { value: VideoCreationOrder }[] = [
  { value: 'oldest_first' },
  { value: 'newest_first' },
  { value: 'lowest_views_first' },
  { value: 'shortest_duration_first' },
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

const UPLOAD_FREQUENCY_KEYS: Record<UploadFrequency, string> = {
  every_5_days: 'every5Days',
  every_3_days: 'every3Days',
  every_2_days: 'every2Days',
  daily_1: 'daily1',
  daily_2: 'daily2',
  daily_3: 'daily3',
};

export function buildUploadScheduleLabel(frequency: UploadFrequency, times: string[]): string {
  const formattedTimes = times.join(', ');
  const key = UPLOAD_FREQUENCY_KEYS[frequency];
  if (!key) return formattedTimes;
  return i18n.t('youtube:form.freq.at', { freq: i18n.t(`youtube:form.freq.${key}`), times: formattedTimes });
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
