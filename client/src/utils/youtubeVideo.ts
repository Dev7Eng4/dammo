import type { YoutubeChannelVideo } from '../types/youtubeChannel'

/** Videos with local assets (prepared/created, or in the local uploads folder) open the content editor. */
export function isLocalContentVideo(video: YoutubeChannelVideo): boolean {
  return video.status === 'Prepared' || video.status === 'Created' || video.localFolder === 'uploads'
}

/** Published on the YouTube channel itself (not just present in the local uploads folder). */
export function isYoutubePublishedVideo(video: YoutubeChannelVideo): boolean {
  return video.status === 'Published' && video.localFolder !== 'uploads'
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
}
