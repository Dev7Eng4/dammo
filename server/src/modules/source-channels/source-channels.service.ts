import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import {
  buildMinimalName,
  canonicalizeSourceUrl,
  parseSourceUrl,
} from '../../shared/platform/url-parser.js';
import { paginate } from '../../shared/types/pagination.js';
import { fetchYoutubeChannelMetadata } from '../../infrastructure/youtube/youtube-channel-fetcher.js';
import {
  fetchAllYoutubeChannelVideos,
} from '../../infrastructure/youtube/youtube-channel-videos-fetcher.js';
import type { YoutubeChannelVideo } from '../../infrastructure/youtube/youtube-channel.types.js';
import { sourceChannelsRepository } from './source-channels.repository.js';
import {
  buildYoutubeChannelUsageCountMap,
  getSourceChannelUsage,
} from './source-channel-usage.js';
import { sourceVideosRepository } from './source-videos.repository.js';
import { nichesService } from '../niches/niches.service.js';
import type {
  CreateSourceChannelInput,
  SourceChannel,
  SourceChannelLanguage,
  SourcePlatform,
  SourcePurpose,
  SourceRiskLevel,
  SourceVideoDurationFilter,
  SourceVideoRecord,
  UpdateSourceChannelInput,
} from './source-channels.types.js';
import { normalizeChannelLanguage } from '../youtube-channels/channel-language.js';

const RISK_ORDER: SourceRiskLevel[] = ['low', 'medium', 'high'];
const DEFAULT_SOURCE_LANGUAGE: SourceChannelLanguage = 'ja';

function nextRiskLevel(current: SourceRiskLevel): SourceRiskLevel | null {
  const index = RISK_ORDER.indexOf(current);
  if (index === -1 || index >= RISK_ORDER.length - 1) return null;
  return RISK_ORDER[index + 1];
}

function withNormalizedLanguage(source: SourceChannel): SourceChannel {
  return {
    ...source,
    language: source.language
      ? normalizeChannelLanguage(source.language)
      : DEFAULT_SOURCE_LANGUAGE,
  };
}

function filterSources(
  sources: SourceChannel[],
  platform?: SourcePlatform,
  purpose?: SourcePurpose,
  language?: SourceChannelLanguage,
  risk?: SourceRiskLevel,
  query?: string,
): SourceChannel[] {
  let results = sources.map(withNormalizedLanguage);

  if (platform) {
    results = results.filter((s) => s.platform === platform);
  }

  if (purpose) {
    results = results.filter((s) => s.purpose === purpose);
  }

  if (language) {
    results = results.filter((s) => s.language === language);
  }

  if (risk) {
    results = results.filter((s) => s.riskLevel === risk);
  }

  if (query?.trim()) {
    const q = query.trim().toLowerCase();
    results = results.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.url.toLowerCase().includes(q) ||
        s.niche.toLowerCase().includes(q) ||
        s.fullUrl.toLowerCase().includes(q),
    );
  }

  return results;
}

async function fetchYoutubeSourceData(fullUrl: string) {
  const metadata = await fetchYoutubeChannelMetadata(fullUrl);
  const videos = await fetchAllYoutubeChannelVideos(fullUrl);
  return { metadata, videos };
}

const EIGHT_MINUTES_SEC = 8 * 60;
const THIRTY_MINUTES_SEC = 30 * 60;
const SIXTY_MINUTES_SEC = 60 * 60;

function toSourceVideoRecords(videos: YoutubeChannelVideo[]): SourceVideoRecord[] {
  return videos.map(({ id, title, url, viewCount, duration }) => ({
    id,
    title,
    url,
    viewCount,
    duration,
  }));
}

function filterVideosByDuration(
  videos: SourceVideoRecord[],
  duration: SourceVideoDurationFilter,
): SourceVideoRecord[] {
  if (duration === 'all') return videos;

  return videos.filter((video) => {
    const seconds = video.duration;
    if (seconds === undefined) return false;

    switch (duration) {
      case 'under_8m':
        return seconds < EIGHT_MINUTES_SEC;
      case '8m_30m':
        return seconds >= EIGHT_MINUTES_SEC && seconds <= THIRTY_MINUTES_SEC;
      case '30m_60m':
        return seconds > THIRTY_MINUTES_SEC && seconds <= SIXTY_MINUTES_SEC;
      case 'over_60m':
        return seconds > SIXTY_MINUTES_SEC;
      default:
        return false;
    }
  });
}

export class SourceChannelsService {
  listPaginated(
    platform: SourcePlatform | undefined,
    purpose: SourcePurpose | undefined,
    language: SourceChannelLanguage | undefined,
    risk: SourceRiskLevel | undefined,
    query: string | undefined,
    page: number,
    limit: number,
  ) {
    const filtered = filterSources(
      sourceChannelsRepository.findAll(),
      platform,
      purpose,
      language,
      risk,
      query,
    );
    const result = paginate(filtered, page, limit);
    const usageCounts = buildYoutubeChannelUsageCountMap();

    return {
      ...result,
      items: result.items.map((source) => ({
        ...source,
        youtubeChannelUsageCount: usageCounts.get(source.id) ?? 0,
      })),
    };
  }

  getById(id: string): SourceChannel {
    const source = sourceChannelsRepository.findById(id);
    if (!source) {
      throw new AppError('Source channel not found', 404, 'NOT_FOUND');
    }
    const usageCounts = buildYoutubeChannelUsageCountMap();
    return {
      ...withNormalizedLanguage(source),
      youtubeChannelUsageCount: usageCounts.get(source.id) ?? 0,
    };
  }

  getVideos(
    id: string,
    page: number,
    limit: number,
    duration: SourceVideoDurationFilter,
  ) {
    this.getById(id);

    const store = sourceVideosRepository.read(id);
    if (!store) {
      return paginate<SourceVideoRecord>([], page, limit);
    }

    const filtered = filterVideosByDuration(store.videos, duration);
    return paginate(filtered, page, limit);
  }

  async refresh(id: string): Promise<{ item: SourceChannel; videos: SourceVideoRecord[] }> {
    const source = this.getById(id);

    if (source.platform !== 'youtube') {
      throw new AppError('Only YouTube sources can be updated', 400, 'UNSUPPORTED_PLATFORM');
    }

    try {
      const { metadata, videos } = await fetchYoutubeSourceData(source.fullUrl);

      const store = sourceVideosRepository.mergeVideosOnRefresh(id, videos, metadata.channelId);

      const handle = metadata.handle.startsWith('@') ? metadata.handle : `@${metadata.handle}`;
      const updated = sourceChannelsRepository.update(id, (current) => ({
        ...current,
        name: metadata.name,
        url: handle,
        fullUrl: `https://youtube.com/${handle}`,
        videoCount: metadata.videoCount,
        subscriberCount: metadata.subscriberCount,
        description: metadata.description,
        channelId: metadata.channelId,
        metadataFetchedAt: new Date().toISOString(),
      }));

      if (!updated) {
        throw new AppError('Source channel not found', 404, 'NOT_FOUND');
      }

      return { item: updated, videos: store.videos };
    } catch (err) {
      if (err instanceof AppError) throw err;
      const detail = err instanceof Error ? err.message : 'Unknown error';
      throw new AppError(`Failed to update source: ${detail}`, 502, 'SOURCE_REFRESH_FAILED');
    }
  }

  async create(input: CreateSourceChannelInput): Promise<SourceChannel> {
    if (!input.url.trim()) {
      throw new AppError('URL is required');
    }

    const niche = input.niche?.trim() ?? '';

    if (niche && !nichesService.exists(niche)) {
      throw new AppError('Niche not found', 400, 'INVALID_NICHE');
    }

    const { platform, url, fullUrl } = parseSourceUrl(input.url);
    const canonicalUrl = canonicalizeSourceUrl(fullUrl);

    const exists = sourceChannelsRepository
      .findAll()
      .some((s) => canonicalizeSourceUrl(s.fullUrl) === canonicalUrl);
    if (exists) {
      throw new AppError('Source URL already exists', 400, 'DUPLICATE_URL');
    }

    const id = generateId();
    let name: string;
    let videoCount: number | undefined;
    let subscriberCount: number | undefined;
    let description: string | undefined;
    let channelId: string | undefined;
    let metadataFetchedAt: string | undefined;
    let displayUrl = url;
    let storedFullUrl = fullUrl;

    if (platform === 'youtube') {
      try {
        const { metadata, videos } = await fetchYoutubeSourceData(fullUrl);

        const duplicateChannel = sourceChannelsRepository
          .findAll()
          .some((s) => s.channelId && s.channelId === metadata.channelId);
        if (duplicateChannel) {
          throw new AppError('Source channel already exists', 400, 'DUPLICATE_CHANNEL');
        }

        name = metadata.name;
        videoCount = metadata.videoCount;
        subscriberCount = metadata.subscriberCount;
        description = metadata.description;
        channelId = metadata.channelId;
        displayUrl = metadata.handle.startsWith('@') ? metadata.handle : `@${metadata.handle}`;
        storedFullUrl = `https://youtube.com/${displayUrl}`;
        metadataFetchedAt = new Date().toISOString();

        sourceVideosRepository.write(id, {
          sourceId: id,
          channelId,
          fetchedAt: metadataFetchedAt,
          videos: toSourceVideoRecords(videos),
        });
      } catch (err) {
        if (err instanceof AppError) throw err;
        const detail = err instanceof Error ? err.message : 'Unknown error';
        throw new AppError(
          `Failed to fetch YouTube channel data: ${detail}`,
          502,
          'YOUTUBE_FETCH_FAILED',
        );
      }
    } else {
      name = buildMinimalName(url, platform);
    }

    const source: SourceChannel = {
      id,
      platform,
      name,
      url: displayUrl,
      fullUrl: storedFullUrl,
      niche,
      purpose: input.purpose,
      language: input.language,
      riskLevel: 'low',
      mappedOwnedChannels: [],
      activeProjects: [],
      videoCount,
      subscriberCount,
      description,
      channelId,
      metadataFetchedAt,
    };

    return sourceChannelsRepository.prepend(source);
  }

  update(id: string, input: UpdateSourceChannelInput): SourceChannel {
    const source = this.getById(id);

    if (input.bumpRisk) {
      const bumped = nextRiskLevel(source.riskLevel);
      if (!bumped) {
        throw new AppError('Risk level is already at maximum', 400, 'MAX_RISK_REACHED');
      }
    }

    const updated = sourceChannelsRepository.update(id, (current) => {
      const next = { ...current };

      if (input.bumpRisk) {
        const bumped = nextRiskLevel(current.riskLevel);
        if (bumped) next.riskLevel = bumped;
      }

      if (input.notes !== undefined) {
        next.notes = input.notes;
      }

      return next;
    });

    if (!updated) {
      throw new AppError('Source channel not found', 404, 'NOT_FOUND');
    }

    return updated;
  }

  getUsage(id: string) {
    this.getById(id);
    return getSourceChannelUsage(id);
  }

  delete(id: string): void {
    this.getById(id);
    const usage = getSourceChannelUsage(id);

    if (usage.inUse) {
      const names = [
        ...usage.channels.youtube,
        ...usage.channels.tiktok,
        ...usage.channels.facebook,
      ]
        .map((channel) => channel.name)
        .join(', ');
      throw new AppError(`Source is used by: ${names}`, 400, 'SOURCE_IN_USE');
    }

    sourceVideosRepository.delete(id);

    if (!sourceChannelsRepository.remove(id)) {
      throw new AppError('Source channel not found', 404, 'NOT_FOUND');
    }
  }
}

export const sourceChannelsService = new SourceChannelsService();
