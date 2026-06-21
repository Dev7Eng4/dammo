import type { YoutubeChannelVideo, YoutubeChannelVideoStatusFilter } from '../types/youtubeChannel';

function resolveVideoStatus(video: YoutubeChannelVideo) {
  return video.status ?? 'Published';
}

export function filterYoutubeChannelVideosByStatus(
  videos: YoutubeChannelVideo[],
  filter: YoutubeChannelVideoStatusFilter,
): YoutubeChannelVideo[] {
  if (filter === 'all') return videos;

  if (filter === 'Draft') {
    return videos.filter((video) => resolveVideoStatus(video) !== 'Published');
  }

  return videos.filter((video) => resolveVideoStatus(video) === filter);
}

export function countYoutubeChannelVideosByStatus(
  videos: YoutubeChannelVideo[],
  status: Exclude<YoutubeChannelVideoStatusFilter, 'all' | 'Draft'>,
): number {
  return videos.filter((video) => resolveVideoStatus(video) === status).length;
}
