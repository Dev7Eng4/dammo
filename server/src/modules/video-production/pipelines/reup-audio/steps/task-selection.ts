import type { SourceVideoRecord } from '../../../../source-channels/source-channels.types.js';
import type { VideoCreationOrder } from '../../../../youtube-channels/youtube-channels.types.js';
import type { ProductionDestination } from '../../../ports/production-destination.port.js';
import type { SourceCatalog } from '../../../ports/source-catalog.port.js';
import { REUP_VIDEO_SELECTION_BUFFER, REUP_VIDEOS_PER_RUN } from '../reup-audio.constants.js';
import type { ReupVideoTask } from '../reup-audio.types.js';

export interface SourceVideoWithSource extends SourceVideoRecord {
  sourceId: string;
}

export interface BuildTasksResult {
  tasks: ReupVideoTask[];
  /** Stop after this many successes (N). May be less than tasks.length when buffer is used. */
  targetCount: number;
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
  order: VideoCreationOrder = 'oldest_first',
): SourceVideoWithSource[] {
  const eligibleWithIndex = videos
    .map((video, index) => ({ video, index }))
    .filter(({ video }) => Boolean(video.url) && !preparedVideoIds.has(video.id));

  if (order === 'lowest_views_first') {
    return eligibleWithIndex
      .sort((a, b) => {
        const viewA = a.video.viewCount ?? Infinity;
        const viewB = b.video.viewCount ?? Infinity;
        if (viewA !== viewB) return viewA - viewB;
        return b.index - a.index;
      })
      .map(({ video }) => video)
      .slice(0, limit);
  }

  if (order === 'shortest_duration_first') {
    return eligibleWithIndex
      .sort((a, b) => {
        const durA = a.video.duration ?? Infinity;
        const durB = b.video.duration ?? Infinity;
        if (durA !== durB) return durA - durB;
        return b.index - a.index;
      })
      .map(({ video }) => video)
      .slice(0, limit);
  }

  const eligible = eligibleWithIndex.map(({ video }) => video);
  const ordered = order === 'oldest_first' ? [...eligible].reverse() : eligible;
  return ordered.slice(0, limit);
}

function toTasks(
  destination: ProductionDestination,
  selected: SourceVideoWithSource[],
): ReupVideoTask[] {
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

export function buildTasks(
  destination: ProductionDestination,
  videos: SourceVideoWithSource[],
  options?: { maxVideosPerChannel?: number; videoIds?: string[] },
): BuildTasksResult {
  const preparedVideoIds = destination.getPreparedVideoIds();

  if (options?.videoIds?.length) {
    const byId = new Map(videos.map(video => [video.id, video]));
    const selected = options.videoIds
      .map(id => byId.get(id))
      .filter((video): video is SourceVideoWithSource => {
        if (!video?.url) return false;
        return !preparedVideoIds.has(video.id);
      });
    const tasks = toTasks(destination, selected);
    return { tasks, targetCount: tasks.length };
  }

  const targetCount = options?.maxVideosPerChannel ?? REUP_VIDEOS_PER_RUN;
  const pickCount = targetCount + REUP_VIDEO_SELECTION_BUFFER;
  const selected = selectVideosForCreation(
    videos,
    preparedVideoIds,
    pickCount,
    destination.videoCreationOrder ?? 'oldest_first',
  );
  return {
    tasks: toTasks(destination, selected),
    targetCount,
  };
}
