import type { RenderDestination } from '../types/videoProduction';

export const VIDEO_TEMPLATE_OPTIONS = [
  { value: 'Ranking_V4', label: 'Ranking V4' },
  { value: 'Quote_Template', label: 'Quote Template' },
  { value: 'News_Feed', label: 'News Feed' },
  { value: 'Listicle_V2', label: 'Listicle V2' },
  { value: 'Story_Shorts', label: 'Story Shorts' },
] as const;

export const VIDEO_DESTINATION_OPTIONS: { value: RenderDestination; label: string }[] = [
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'web', label: 'Web' },
];

export const RENDER_DESTINATION_LABELS: Record<RenderDestination, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  web: 'Web',
};
