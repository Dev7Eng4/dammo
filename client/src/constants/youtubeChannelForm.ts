import type { UploadFrequency, YoutubeChannelType } from '../types/youtubeChannel';

export const YOUTUBE_CHANNEL_TYPE_OPTIONS: { value: YoutubeChannelType; label: string }[] = [
  { value: 'content', label: 'Content' },
  { value: 'reup', label: 'Reup' },
  { value: 'content_sale', label: 'Content Sale' },
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
