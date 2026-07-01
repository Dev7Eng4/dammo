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
import { youtubeChannelVideosRepository } from './youtube-channel-videos.repository.js';
import { videoProductionService } from '../video-production/video-production.service.js';
import { mergeChannelVideos } from './merge-channel-videos.js';
import { videoPrepareRepository } from './video-prepare.repository.js';
import {
  resolveBackgroundFootageNamesOnly,
  resolveSourceChannelNamesOnly,
  resolveSourceNamesForChannel,
} from './youtube-channel-sources.js';
import { normalizeChannelLanguage } from './channel-language.js';
import { normalizeUploadSchedule } from './upload-schedule.js';
import { assertValidThumbnailStyleKey } from '../prompts/thumbnail-styles.js';
import { validateReupAudioVisualStyleId } from './reup-audio-visual-style.js';
import type {
  CreateYoutubeChannelInput,
  MonetizationStatus,
  ReupAudioVideoType,
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
  | 'language'
  | 'sourceChannels'
  | 'backgroundFootageSources'
  | 'thumbnailStyleKey'
  | 'reupAudioVideoType'
  | 'reupAudioVisualStyleId'
  | 'uploadFrequency'
  | 'publishTimes'
>;

function isReupChannelType(type: YoutubeChannelType): boolean {
  return type === 'reup_audio' || type === 'reup_video';
}

function isReupAudioChannelType(type: YoutubeChannelType): boolean {
  return type === 'reup_audio';
}

function normalizeSourceIds(ids: string[] | undefined): string[] {
  return [...new Set((ids ?? []).map(id => id.trim()).filter(Boolean))];
}

function validateChannelConfig(input: ChannelConfigInput): {
  linkedEmail: string;
  sourceChannels: string[];
  uploadSchedule: string[];
  backgroundFootageSources?: string[];
  thumbnailStyleKey?: string;
  reupAudioVideoType?: ReupAudioVideoType;
  reupAudioVisualStyleId?: string;
} {
  let linkedEmail = 'Default';
  if (input.mailAccountId && input.mailAccountId.toLowerCase() !== 'default') {
    const mailAccount = mailAccountsRepository.findById(input.mailAccountId);
    if (!mailAccount) {
      throw new AppError('Mail account not found', 404, 'MAIL_NOT_FOUND');
    }
    linkedEmail = mailAccount.email;
  }

  const sourceChannels = normalizeSourceIds(input.sourceChannels);

  if (isReupChannelType(input.type)) {
    if (sourceChannels.length === 0) {
      throw new AppError('Reup channels require at least one source channel', 400, 'VALIDATION_ERROR');
    }
  }

  for (const sourceId of sourceChannels) {
    const source = sourceChannelsRepository.findById(sourceId);
    if (!source) {
      throw new AppError('Source channel not found', 404, 'SOURCE_NOT_FOUND');
    }
  }

  const backgroundFootageSources = normalizeSourceIds(input.backgroundFootageSources);
  for (const sourceId of backgroundFootageSources) {
    requireSourceWithPurpose(sourceId, 'background_footage', 'Background footage');
  }

  const uploadSchedule = normalizeUploadSchedule(input.publishTimes);

  const thumbnailStyleKey = assertValidThumbnailStyleKey(
    input.thumbnailStyleKey,
    input.language,
    false,
  );

  let reupAudioVideoType: ReupAudioVideoType | undefined;
  let reupAudioVisualStyleId: string | undefined;

  if (isReupAudioChannelType(input.type)) {
    if (!input.reupAudioVideoType) {
      throw new AppError('Video type is required for Reup Audio channels', 400, 'VALIDATION_ERROR');
    }
    if (!input.reupAudioVisualStyleId?.trim()) {
      throw new AppError('Video style is required for Reup Audio channels', 400, 'VALIDATION_ERROR');
    }
    validateReupAudioVisualStyleId(
      input.reupAudioVideoType,
      input.reupAudioVisualStyleId.trim(),
      input.language,
    );
    reupAudioVideoType = input.reupAudioVideoType;
    reupAudioVisualStyleId = input.reupAudioVisualStyleId.trim();
  }

  return {
    linkedEmail,
    sourceChannels,
    uploadSchedule,
    ...(backgroundFootageSources.length > 0 ? { backgroundFootageSources } : {}),
    ...(thumbnailStyleKey ? { thumbnailStyleKey } : {}),
    ...(reupAudioVideoType ? { reupAudioVideoType } : {}),
    ...(reupAudioVisualStyleId ? { reupAudioVisualStyleId } : {}),
  };
}

function assertEmailAvailableForChannel(email: string, channelId?: string): void {
  const normalized = email.toLowerCase();
  if (normalized === 'default') {
    return;
  }
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
        sourceChannelNames: resolveSourceChannelNamesOnly(channel),
        backgroundFootageNames: resolveBackgroundFootageNamesOnly(channel),
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
      sourceNames: resolveSourceNamesForChannel(channel),
      sourceChannelNames: resolveSourceChannelNamesOnly(channel),
      backgroundFootageNames: resolveBackgroundFootageNamesOnly(channel),
    };
  }

  async getLiveById(id: string): Promise<YoutubeChannel> {
    const channel = this.getById(id);
    try {
      return await this.refreshChannelMetadata(id, channel);
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

  private async refreshChannelMetadata(id: string, channel = this.getById(id)): Promise<YoutubeChannel> {
    if (!channel.youtubeUrl || !channel.channelId || channel.youtubeUrl.includes('@channel_')) {
      return {
        ...channel,
        language: normalizeChannelLanguage(channel.language),
      };
    }
    const metadata = await fetchYoutubeChannelMetadata(channel.youtubeUrl);
    const handle = metadata.handle.startsWith('@') ? metadata.handle : `@${metadata.handle}`;

    const updated = youtubeChannelsRepository.update(id, (current) => ({
      ...current,
      name: metadata.name,
      handle,
      channelId: metadata.channelId ?? current.channelId,
    }));

    if (!updated) {
      throw new AppError('Channel not found', 404, 'NOT_FOUND');
    }

    return {
      ...updated,
      language: normalizeChannelLanguage(updated.language),
    };
  }

  private async fetchVideos(channel: YoutubeChannel): Promise<YoutubeChannelVideo[]> {
    if (!channel.youtubeUrl || !channel.channelId || channel.youtubeUrl.includes('@channel_')) {
      return [];
    }
    try {
      return await fetchAllYoutubeChannelVideos(channel.youtubeUrl);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error';
      throw new AppError(`Failed to fetch YouTube channel videos: ${detail}`, 502, 'YOUTUBE_FETCH_FAILED');
    }
  }

  private persistVideos(channelId: string, videos: YoutubeChannelVideo[]): string {
    const fetchedAt = new Date().toISOString();
    youtubeChannelVideosRepository.write(channelId, { channelId, fetchedAt, videos });
    return fetchedAt;
  }

  private mergeVideosWithPrepare(channelId: string, videos: YoutubeChannelVideo[]): YoutubeChannelVideo[] {
    const prepare = videoPrepareRepository.read(channelId);
    return mergeChannelVideos(videos, prepare);
  }

  async getVideos(id: string): Promise<{ items: YoutubeChannelVideo[]; fetchedAt?: string }> {
    const channel = this.getById(id);

    const store = youtubeChannelVideosRepository.read(id);
    if (store) {
      return {
        items: this.mergeVideosWithPrepare(id, store.videos),
        fetchedAt: store.fetchedAt,
      };
    }

    const videos = await this.fetchVideos(channel);
    const fetchedAt = this.persistVideos(id, videos);
    return { items: this.mergeVideosWithPrepare(id, videos), fetchedAt };
  }

  async syncVideos(
    id: string,
  ): Promise<{ item: YoutubeChannel; videos: YoutubeChannelVideo[]; fetchedAt: string }> {
    const channel = this.getById(id);
    const [videos, item] = await Promise.all([
      this.fetchVideos(channel),
      this.refreshChannelMetadata(id, channel),
    ]);
    const fetchedAt = this.persistVideos(id, videos);
    return { item, videos: this.mergeVideosWithPrepare(id, videos), fetchedAt };
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

    let name = '';
    let handle = '';
    let youtubeUrl = '';
    let channelId: string | undefined = undefined;
    let niche = '';

    if (input.channelUrl && input.channelUrl.trim() !== '') {
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

        handle = metadata.handle.startsWith('@') ? metadata.handle : `@${metadata.handle}`;
        youtubeUrl = `https://youtube.com/${handle}`;
        name = metadata.name;
        channelId = metadata.channelId;
      } catch (err) {
        if (err instanceof AppError) throw err;
        const detail = err instanceof Error ? err.message : 'Unknown error';
        throw new AppError(
          `Failed to fetch YouTube channel metadata: ${detail}`,
          502,
          'YOUTUBE_FETCH_FAILED',
        );
      }
    } else {
      const id = generateId().slice(0, 8);
      handle = `@channel_${id}`;
      youtubeUrl = `https://youtube.com/${handle}`;
      
      let emailPrefix = 'Channel';
      if (config.linkedEmail && config.linkedEmail.toLowerCase() !== 'default') {
        emailPrefix = config.linkedEmail.split('@')[0] || 'Channel';
      }
      name = emailPrefix;
    }

    const channel: YoutubeChannel = {
      id: generateId(),
      name,
      handle,
      youtubeUrl,
      channelId,
      type: input.type,
      niche,
      language: input.language,
      monetizationStatus: 'in_review',
      healthScore: 'medium',
      status: 'active',
      linkedEmail: config.linkedEmail,
      uploadSchedule: config.uploadSchedule,
      sourceChannels: config.sourceChannels,
      contentProjectId: buildProjectId(handle),
      createdAt: new Date().toISOString(),
      uploadFrequency: input.uploadFrequency,
      ...(config.backgroundFootageSources?.length
        ? { backgroundFootageSources: config.backgroundFootageSources }
        : {}),
      ...(config.thumbnailStyleKey ? { thumbnailStyleKey: config.thumbnailStyleKey } : {}),
      ...(config.reupAudioVideoType ? { reupAudioVideoType: config.reupAudioVideoType } : {}),
      ...(config.reupAudioVisualStyleId
        ? { reupAudioVisualStyleId: config.reupAudioVisualStyleId }
        : {}),
    };

    return youtubeChannelsRepository.prepend(channel);
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
        sourceChannels: config.sourceChannels,
        uploadSchedule: config.uploadSchedule,
        uploadFrequency: input.uploadFrequency,
      };

      if (config.backgroundFootageSources?.length) {
        next.backgroundFootageSources = config.backgroundFootageSources;
      } else {
        delete next.backgroundFootageSources;
      }

      if (config.thumbnailStyleKey) {
        next.thumbnailStyleKey = config.thumbnailStyleKey;
      } else {
        delete next.thumbnailStyleKey;
      }

      if (isReupAudioChannelType(input.type)) {
        next.reupAudioVideoType = config.reupAudioVideoType;
        next.reupAudioVisualStyleId = config.reupAudioVisualStyleId;
      } else {
        delete next.reupAudioVideoType;
        delete next.reupAudioVisualStyleId;
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
    return videoProductionService.createVideosForYoutubeChannel(id);
  }

  async createVideosForAllReupChannels() {
    return videoProductionService.createVideosForAllReupChannels();
  }

  async createVideosForChannels(channelIds: string[]) {
    return videoProductionService.createVideosForChannels(channelIds);
  }
}

export const youtubeChannelsService = new YoutubeChannelsService();
