import type { SourceVideoRecord } from '../../../../source-channels/source-channels.types.js';
import type { ProductionDestination } from '../../../ports/production-destination.port.js';
import type { SourceCatalog } from '../../../ports/source-catalog.port.js';
import { REUP_VIDEOS_PER_RUN } from '../reup-audio.constants.js';
import type { ReupVideoTask } from '../reup-audio.types.js';

export interface SourceVideoWithSource extends SourceVideoRecord {
  sourceId: string;
}

export function collectSourceVideos(
  sourceCatalog: SourceCatalog,
  sourceChannels: string[],
): SourceVideoWithSource[] {
  const videos: SourceVideoWithSource[] = [];

  for (const source of sourceCatalog.resolveSources(sourceChannels)) {
    for (const video of sourceCatalog.listVideos(source.id)) {
      videos.push({ ...video, sourceId: source.id });
    }
  }

  return videos;
}

/** Chọn video theo thứ tự tạo (mảng store thường mới → cũ). Bỏ qua video đã prepare. */
function selectVideosForCreation(
  videos: SourceVideoWithSource[],
  preparedVideoIds: Set<string>,
  limit: number,
  order: 'oldest_first' | 'newest_first' = 'oldest_first',
): SourceVideoWithSource[] {
  const eligible = videos.filter(video => Boolean(video.url) && !preparedVideoIds.has(video.id));
  const ordered = order === 'oldest_first' ? [...eligible].reverse() : eligible;
  return ordered.slice(0, limit);
}

export function buildTasks(
  destination: ProductionDestination,
  videos: SourceVideoWithSource[],
  options?: { maxVideosPerChannel?: number; videoIds?: string[] },
): ReupVideoTask[] {
  const preparedVideoIds = destination.getPreparedVideoIds();

  let selected: SourceVideoWithSource[];

  if (options?.videoIds?.length) {
    const byId = new Map(videos.map(video => [video.id, video]));
    selected = options.videoIds
      .map(id => byId.get(id))
      .filter((video): video is SourceVideoWithSource => {
        if (!video?.url) return false;
        return !preparedVideoIds.has(video.id);
      });
  } else {
    const limit = options?.maxVideosPerChannel ?? REUP_VIDEOS_PER_RUN;
    selected = selectVideosForCreation(
      videos,
      preparedVideoIds,
      limit,
      destination.videoCreationOrder ?? 'oldest_first',
    );
  }

  return selected.map(video => ({
    link: video.url,
    id: destination.id,
    language: destination.language,
    videoId: video.id,
    sourceId: video.sourceId,
    sourceTitle: video.title?.trim() || video.id,
    sourceStatus: video.status,
  }));
}
