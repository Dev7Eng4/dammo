import { sourceChannelsRepository } from '../source-channels/source-channels.repository.js';
import { sourceVideosRepository } from '../source-channels/source-videos.repository.js';

export interface TrendingSourceVideo {
  videoId: string;
  title: string;
  url: string;
  viewCount: number;
  /** viewCount ÷ median viewCount of the same source channel. */
  ratio: number;
  sourceId: string;
  sourceName: string;
  /** Already used (number of times) or downloaded locally. */
  used: boolean;
}

const MIN_VIDEOS_FOR_BASELINE = 5;
const MIN_RATIO = 3;
const MIN_VIEWS = 1000;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Outlier videos inside each tracked source channel (views far above that channel's own median).
 * Stored source videos carry no upload date, so this ranks by relative views, not by age/velocity.
 */
export function getTrendingSourceVideos(limit = 8): TrendingSourceVideo[] {
  const results: TrendingSourceVideo[] = [];

  for (const source of sourceChannelsRepository.findAll()) {
    if (source.platform !== 'youtube') continue;
    const store = sourceVideosRepository.read(source.id);
    const counted = (store?.videos ?? []).filter(
      (video): video is typeof video & { viewCount: number } =>
        typeof video.viewCount === 'number' && video.viewCount >= 0,
    );
    if (counted.length < MIN_VIDEOS_FOR_BASELINE) continue;

    const baseline = median(counted.map((video) => video.viewCount));
    if (baseline <= 0) continue;

    for (const video of counted) {
      const ratio = video.viewCount / baseline;
      if (ratio < MIN_RATIO || video.viewCount < MIN_VIEWS) continue;
      results.push({
        videoId: video.id,
        title: video.title,
        url: video.url,
        viewCount: video.viewCount,
        ratio,
        sourceId: source.id,
        sourceName: source.name,
        used: (video.used ?? 0) > 0 || video.status === 'Downloaded',
      });
    }
  }

  return results.sort((a, b) => b.ratio - a.ratio).slice(0, limit);
}
