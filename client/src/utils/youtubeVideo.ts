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

/**
 * dd/MM/yyyy (vi) or MM/dd/yyyy (en). Formatted in UTC because yt-dlp only knows the day
 * (older videos are approximate), so a local-timezone shift would move the date.
 */
export function formatPublishedDate(iso: string, language: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(language === 'en' ? 'en-US' : 'vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
