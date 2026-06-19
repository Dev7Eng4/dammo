import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import { parseSourceUrl, canonicalizeSourceUrl } from '../../shared/platform/url-parser.js';
import { paginate } from '../../shared/types/pagination.js';
import { fetchYoutubeChannelMetadata } from '../../infrastructure/youtube/youtube-channel-fetcher.js';
import { fetchAllYoutubeChannelVideos } from '../../infrastructure/youtube/youtube-channel-videos-fetcher.js';
import { fetchYoutubeVideoComments } from '../../infrastructure/youtube/youtube-video-comments-fetcher.js';
import type { YoutubeVideoComment } from '../../infrastructure/youtube/youtube-comment.types.js';
import type { YoutubeChannelVideo } from '../../infrastructure/youtube/youtube-channel.types.js';
import { mailAccountsRepository } from '../mail-accounts/mail-accounts.repository.js';
import { sourceChannelsRepository } from '../source-channels/source-channels.repository.js';
import { youtubeChannelsRepository } from './youtube-channels.repository.js';
import { reupVideoCreatorService } from './reup-video-creator.service.js';
import { resolveSourceNamesForChannel } from './youtube-channel-sources.js';
import { normalizeChannelLanguage } from './channel-language.js';
import { normalizeUploadSchedule } from './upload-schedule.js';
import type {
  CreateYoutubeChannelInput,
  MonetizationStatus,
  UpdateYoutubeChannelInput,
  YoutubeChannel,
  YoutubeChannelStats,
  YoutubeChannelType,
} from './youtube-channels.types.js';

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function filterChannels(
  channels: YoutubeChannel[],
  type?: YoutubeChannelType,
  monetization?: MonetizationStatus,
  query?: string,
): YoutubeChannel[] {
  let results = channels;

  if (type) {
    results = results.filter((c) => c.type === type);
  }

  if (monetization) {
    results = results.filter((c) => c.monetizationStatus === monetization);
  }

  if (query?.trim()) {
    const q = query.trim().toLowerCase();
    results = results.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.handle.toLowerCase().includes(q) ||
        c.niche.toLowerCase().includes(q) ||
        c.linkedEmail.toLowerCase().includes(q) ||
        c.contentProjectId.toLowerCase().includes(q),
    );
  }

  return results;
}

function isStale(channel: YoutubeChannel): boolean {
  if (!channel.lastUploadAt) return true;
  return Date.now() - new Date(channel.lastUploadAt).getTime() > STALE_THRESHOLD_MS;
}

function buildProjectId(handle: string): string {
  const slug = handle.replace(/^@/, '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
  return `PRJ-${slug || 'NEW'}`;
}

function requireSourceWithPurpose(
  sourceId: string,
  purpose: 'reup' | 'background_footage',
  fieldLabel: string,
): void {
  const source = sourceChannelsRepository.findById(sourceId);
  if (!source) {
    throw new AppError('Source channel not found', 404, 'SOURCE_NOT_FOUND');
  }
  if (source.purpose !== purpose) {
    throw new AppError(
      `${fieldLabel} must be a source channel with purpose "${purpose}"`,
      400,
      'INVALID_SOURCE_PURPOSE',
    );
  }
}

type ChannelConfigInput = Pick<
  CreateYoutubeChannelInput,
  | 'mailAccountId'
  | 'type'
  | 'sourceChannelIds'
  | 'backgroundFootageSourceId'
  | 'uploadFrequency'
  | 'publishTimes'
>;

function isReupChannelType(type: YoutubeChannelType): boolean {
  return type === 'reup_audio' || type === 'reup_video';
}

function buildSourceMapping(sourceChannelIds: string[] | undefined): string {
  const ids = [...new Set((sourceChannelIds ?? []).map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return '';

  const mappings: string[] = [];
  for (const sourceChannelId of ids) {
    const source = sourceChannelsRepository.findById(sourceChannelId);
    if (!source) {
      throw new AppError('Source channel not found', 404, 'SOURCE_NOT_FOUND');
    }
    mappings.push(source.fullUrl);
  }
  return mappings.join(', ');
}

function validateChannelConfig(input: ChannelConfigInput): {
  linkedEmail: string;
  sourceMapping: string;
  uploadSchedule: string[];
  backgroundFootageSourceId?: string;
} {
  const mailAccount = mailAccountsRepository.findById(input.mailAccountId);
  if (!mailAccount) {
    throw new AppError('Mail account not found', 404, 'MAIL_NOT_FOUND');
  }

  if (isReupChannelType(input.type)) {
    const sourceIds = (input.sourceChannelIds ?? []).map((id) => id.trim()).filter(Boolean);
    if (sourceIds.length === 0) {
      throw new AppError('Reup channels require at least one source channel', 400, 'VALIDATION_ERROR');
    }
  }

  const sourceMapping = buildSourceMapping(input.sourceChannelIds);

  const backgroundFootageSourceId = input.backgroundFootageSourceId?.trim();
  if (backgroundFootageSourceId) {
    requireSourceWithPurpose(backgroundFootageSourceId, 'background_footage', 'Background footage');
  }

  const uploadSchedule = normalizeUploadSchedule(input.publishTimes);

  return {
    linkedEmail: mailAccount.email,
    sourceMapping,
    uploadSchedule,
    ...(backgroundFootageSourceId ? { backgroundFootageSourceId } : {}),
  };
}

function assertEmailAvailableForChannel(email: string, channelId?: string): void {
  const normalized = email.toLowerCase();
  const taken = youtubeChannelsRepository
    .findAll()
    .some((c) => c.id !== channelId && c.linkedEmail.toLowerCase() === normalized);
  if (taken) {
    throw new AppError('Email already linked to another channel', 400, 'DUPLICATE_EMAIL');
  }
}

export class YoutubeChannelsService {
  getStats(): YoutubeChannelStats {
    const channels = youtubeChannelsRepository.findAll();
    const now = Date.now();

    return {
      total: channels.length,
      monetized: channels.filter((c) => c.monetizationStatus === 'monetized').length,
      inReview: channels.filter((c) => c.monetizationStatus === 'in_review').length,
      limited: channels.filter(
        (c) => c.monetizationStatus === 'limited' || c.monetizationStatus === 'demonetized',
      ).length,
      stale: channels.filter(isStale).length,
      addedThisWeek: channels.filter(
        (c) => now - new Date(c.createdAt).getTime() <= WEEK_MS,
      ).length,
    };
  }

  listPaginated(
    type: YoutubeChannelType | undefined,
    monetization: MonetizationStatus | undefined,
    query: string | undefined,
    page: number,
    limit: number,
  ) {
    const filtered = filterChannels(youtubeChannelsRepository.findAll(), type, monetization, query);
    const result = paginate(filtered, page, limit);
    return {
      ...result,
      items: result.items.map((channel) => ({
        ...channel,
        sourceNames: resolveSourceNamesForChannel(channel),
      })),
    };
  }

  getById(id: string): YoutubeChannel {
    const channel = youtubeChannelsRepository.findById(id);
    if (!channel) {
      throw new AppError('Channel not found', 404, 'NOT_FOUND');
    }
    return {
      ...channel,
      language: normalizeChannelLanguage(channel.language),
    };
  }

  async getLiveById(id: string): Promise<YoutubeChannel> {
    const channel = this.getById(id);
    try {
      const metadata = await fetchYoutubeChannelMetadata(channel.youtubeUrl);
      const handle = metadata.handle.startsWith('@') ? metadata.handle : `@${metadata.handle}`;

      return {
        ...channel,
        name: metadata.name,
        handle,
        niche: metadata.niche,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error';
      throw new AppError(
        `Failed to fetch YouTube channel metadata: ${detail}`,
        502,
        'YOUTUBE_FETCH_FAILED',
      );
    }
  }

  private async fetchVideos(channel: YoutubeChannel): Promise<YoutubeChannelVideo[]> {
    try {
      return await fetchAllYoutubeChannelVideos(channel.youtubeUrl);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error';
      throw new AppError(`Failed to fetch YouTube channel videos: ${detail}`, 502, 'YOUTUBE_FETCH_FAILED');
    }
  }

  async getVideos(id: string): Promise<{ items: YoutubeChannelVideo[] }> {
    const channel = this.getById(id);
    const items = await this.fetchVideos(channel);
    return { items };
  }

  async syncVideos(id: string): Promise<{ item: YoutubeChannel; videos: YoutubeChannelVideo[] }> {
    const channel = this.getById(id);
    const videos = await this.fetchVideos(channel);
    return { item: channel, videos };
  }

  async getVideoComments(
    channelId: string,
    videoId: string,
  ): Promise<{ items: YoutubeVideoComment[] }> {
    this.getById(channelId);

    try {
      const items = await fetchYoutubeVideoComments(videoId);
      return { items };
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error';
      throw new AppError(
        `Failed to fetch YouTube video comments: ${detail}`,
        502,
        'YOUTUBE_FETCH_FAILED',
      );
    }
  }

  async create(input: CreateYoutubeChannelInput): Promise<YoutubeChannel> {
    const config = validateChannelConfig(input);
    assertEmailAvailableForChannel(config.linkedEmail);

    const { platform, fullUrl } = parseSourceUrl(input.channelUrl);
    if (platform !== 'youtube') {
      throw new AppError('Channel URL must be a YouTube link', 400, 'INVALID_PLATFORM');
    }

    const canonicalUrl = canonicalizeSourceUrl(fullUrl);

    const exists = youtubeChannelsRepository
      .findAll()
      .some((c) => canonicalizeSourceUrl(c.youtubeUrl) === canonicalUrl);
    if (exists) {
      throw new AppError('YouTube channel already exists', 400, 'DUPLICATE_CHANNEL');
    }

    try {
      const metadata = await fetchYoutubeChannelMetadata(fullUrl);

      const duplicateById = youtubeChannelsRepository
        .findAll()
        .some((c) => c.channelId && c.channelId === metadata.channelId);
      if (duplicateById) {
        throw new AppError('YouTube channel already exists', 400, 'DUPLICATE_CHANNEL');
      }

      const handle = metadata.handle.startsWith('@') ? metadata.handle : `@${metadata.handle}`;
      const youtubeUrl = `https://youtube.com/${handle}`;

      const channel: YoutubeChannel = {
        id: generateId(),
        name: metadata.name,
        handle,
        youtubeUrl,
        channelId: metadata.channelId,
        type: input.type,
        niche: metadata.niche,
        language: input.language,
        monetizationStatus: 'in_review',
        healthScore: 'medium',
        status: 'active',
        linkedEmail: config.linkedEmail,
        uploadSchedule: config.uploadSchedule,
        sourceMapping: config.sourceMapping,
        contentProjectId: buildProjectId(handle),
        recentActivity: [],
        createdAt: new Date().toISOString(),
        uploadFrequency: input.uploadFrequency,
        ...(config.backgroundFootageSourceId
          ? { backgroundFootageSourceId: config.backgroundFootageSourceId }
          : {}),
      };

      return youtubeChannelsRepository.prepend(channel);
    } catch (err) {
      if (err instanceof AppError) throw err;
      const detail = err instanceof Error ? err.message : 'Unknown error';
      throw new AppError(
        `Failed to fetch YouTube channel metadata: ${detail}`,
        502,
        'YOUTUBE_FETCH_FAILED',
      );
    }
  }

  update(id: string, input: UpdateYoutubeChannelInput): YoutubeChannel {
    this.getById(id);
    const config = validateChannelConfig(input);
    assertEmailAvailableForChannel(config.linkedEmail, id);

    const updated = youtubeChannelsRepository.update(id, (current) => {
      const next: YoutubeChannel = {
        ...current,
        type: input.type,
        language: input.language,
        linkedEmail: config.linkedEmail,
        sourceMapping: config.sourceMapping,
        uploadSchedule: config.uploadSchedule,
        uploadFrequency: input.uploadFrequency,
      };

      if (config.backgroundFootageSourceId) {
        next.backgroundFootageSourceId = config.backgroundFootageSourceId;
      } else {
        delete next.backgroundFootageSourceId;
      }

      if (!isReupChannelType(input.type)) {
        delete next.reupVideoSourceId;
        delete next.reupAudioSourceId;
      }

      return next;
    });

    if (!updated) {
      throw new AppError('Channel not found', 404, 'NOT_FOUND');
    }

    return updated;
  }

  async createVideos(id: string) {
    return reupVideoCreatorService.createVideos(id);
  }

  async createVideosForAllReupChannels() {
    return reupVideoCreatorService.createVideosForAllReupChannels();
  }
}

export const youtubeChannelsService = new YoutubeChannelsService();
