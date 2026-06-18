import type { UploadFrequency } from './youtube-channels.types.js';

export function getPublishTimeSlotCount(frequency: UploadFrequency): number {
  switch (frequency) {
    case 'daily_2':
      return 2;
    case 'daily_3':
      return 3;
    default:
      return 1;
  }
}

export function normalizeUploadSchedule(times: string[]): string[] {
  return times.map((time) => time.trim()).filter(Boolean);
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
