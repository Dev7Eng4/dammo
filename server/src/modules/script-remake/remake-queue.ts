import { listTrendSourceVideos, trendVideoIdsClaimedByOthers } from '../brains/trend-source-videos.js';
import { sourceCatalogAdapter } from '../video-production/adapters/source-catalog.adapter.js';
import {
  collectSourceVideos,
  selectVideosForCreation,
  type SourceVideoWithSource,
} from '../video-production/pipelines/reup-audio/steps/task-selection.js';
import { videoPrepareRepository } from '../youtube-channels/video-prepare.repository.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import type { YoutubeChannel } from '../youtube-channels/youtube-channels.types.js';

export interface UpcomingRemakeChannel {
  channelId: string;
  channelName: string;
  niche: string;
  trendClusters: string[];
  /** Why the list is empty or shorter than asked, when it is. */
  note?: string;
  videos: Array<{ id: string; title: string; url: string; viewCount?: number; duration?: number }>;
}

/** Remake channels that remake and narrate on "Chuẩn bị video" (auto remake not switched off). */
function remakeChannels(channelId?: string): YoutubeChannel[] {
  return youtubeChannelsRepository
    .findAll()
    .filter(channel => channel.type === 'remake_video')
    .filter(channel => (channelId ? channel.id === channelId : channel.status !== 'paused'))
    .filter(channel => channel.remakeAuto?.enabled !== false);
}

/**
 * The source videos each remake channel will prepare next, in the order "Chuẩn bị video" picks them
 * (same selection as the reup-audio pipeline: channel order, trend-brain videos hottest first, prepared ones skipped).
 */
export function listUpcomingRemakeSources(options: { channelId?: string; limit: number }): UpcomingRemakeChannel[] {
  return remakeChannels(options.channelId).map(channel => {
    const base = {
      channelId: channel.id,
      channelName: channel.name,
      niche: channel.niche ?? '',
      trendClusters: channel.trendClusters ?? [],
    } satisfies Omit<UpcomingRemakeChannel, 'videos' | 'note'>;

    let videos: SourceVideoWithSource[];
    let order = channel.videoCreationOrder ?? 'oldest_first';
    if (channel.sourceMode === 'trend_brain') {
      const claimed = trendVideoIdsClaimedByOthers(channel.id);
      videos = listTrendSourceVideos({ clusters: channel.trendClusters ?? [] })
        .filter(video => !claimed.has(video.id))
        .map(({ id, title, url, viewCount, duration, sourceId }) => ({ id, title, url, viewCount, duration, sourceId }));
      order = 'newest_first';
    } else {
      videos = collectSourceVideos(sourceCatalogAdapter, channel.sourceChannels ?? []);
    }

    const picked = selectVideosForCreation(videos, videoPrepareRepository.getPreparedVideoIds(channel.id), options.limit, order);
    return {
      ...base,
      ...(picked.length === 0 ? { note: 'không còn video nguồn chưa làm' } : {}),
      videos: picked.map(video => ({
        id: video.id,
        title: video.title?.trim() || video.id,
        url: video.url,
        ...(video.viewCount != null ? { viewCount: video.viewCount } : {}),
        ...(video.duration != null ? { duration: video.duration } : {}),
      })),
    };
  });
}
