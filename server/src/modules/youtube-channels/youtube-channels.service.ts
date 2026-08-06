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
import { nichesService } from '../niches/niches.service.js';
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
import { assertValidCaptionStyleKey } from '../video-production/shared/si-video/caption-styles.js';
import { resolveAiSceneDensityMaxSec } from '../video-production/shared/ai-video/ai-video.constants.js';
import { validateReupAudioVisualStyleId } from './reup-audio-visual-style.js';
import { getNextYoutubePublishSlot } from '../youtube-upload/publish-schedule.js';
import { resolveYoutubeChannelVideoDir, youtubeChannelUploadsDir } from '../../config/paths.js';
import fs from 'node:fs';
import path from 'node:path';
import { thumbnailBackgroundsService } from './thumbnail-backgrounds.service.js';
import { assetsService } from '../assets/assets.service.js';
import { channelAvatarsService } from './channel-avatars.service.js';
import { SI_OVERLAY_AUTO_SENTINEL } from '../video-production/shared/si-video/si.constants.js';
import type {
  AiSceneDensityMaxSec,
  CaptionStyleKey,
  CreateYoutubeChannelInput,
  BackgroundFootageMode,
  MonetizationStatus,
  ReupAudioBackgroundImage,
  ReupAudioVideoType,
  UpdateYoutubeChannelInput,
  VideoCreationOrder,
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
  | 'videoCreationOrder'
  | 'backgroundFootageSources'
  | 'backgroundFootageMode'
  | 'thumbnailStyleKey'
  | 'captionStyleKey'
  | 'reupAudioVideoType'
  | 'reupAudioVisualStyleId'
  | 'reupAudioBackgroundImage'
  | 'aiSceneDensityMaxSec'
  | 'useReferenceImage'
  | 'showAudioBar'
  | 'audioBarFile'
  | 'showChannelAvatar'
  | 'showSubscribe'
  | 'showSmallVideo'
  | 'smallVideoFile'
  | 'subscribeFile'
  | 'showDisclaimer'
  | 'disclaimerText'
  | 'descriptionDisclaimerText'
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
  videoCreationOrder?: VideoCreationOrder;
  backgroundFootageSources?: string[];
  backgroundFootageMode?: BackgroundFootageMode;
  thumbnailStyleKey?: string;
  captionStyleKey?: CaptionStyleKey;
  reupAudioVideoType?: ReupAudioVideoType;
  reupAudioVisualStyleId?: string;
  reupAudioBackgroundImage?: ReupAudioBackgroundImage;
  aiSceneDensityMaxSec?: AiSceneDensityMaxSec;
  useReferenceImage?: boolean;
  showAudioBar?: boolean;
  audioBarFile?: string;
  showChannelAvatar?: boolean;
  showSubscribe?: boolean;
  showSmallVideo?: boolean;
  smallVideoFile?: string;
  subscribeFile?: string;
  showDisclaimer?: boolean;
  disclaimerText?: string;
  descriptionDisclaimerText?: string;
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

  const backgroundFootageMode: BackgroundFootageMode =
    input.backgroundFootageMode === 'local' ? 'local' : 'source';

  let backgroundFootageSources: string[] = [];
  if (backgroundFootageMode === 'source') {
    backgroundFootageSources = normalizeSourceIds(input.backgroundFootageSources);
    for (const sourceId of backgroundFootageSources) {
      requireSourceWithPurpose(sourceId, 'background_footage', 'Background footage');
    }
  }

  const uploadSchedule = normalizeUploadSchedule(input.publishTimes);

  const thumbnailStyleKey = assertValidThumbnailStyleKey(
    input.thumbnailStyleKey,
    input.language,
    false,
  );

  let reupAudioVideoType: ReupAudioVideoType | undefined;
  let reupAudioVisualStyleId: string | undefined;
  let reupAudioBackgroundImage: ReupAudioBackgroundImage | undefined;
  let aiSceneDensityMaxSec: AiSceneDensityMaxSec | undefined;
  let useReferenceImage: boolean | undefined;
  let showAudioBar: boolean | undefined;
  let audioBarFile: string | undefined;
  let showSmallVideo: boolean | undefined;
  let smallVideoFile: string | undefined;
  let showSubscribe: boolean | undefined;
  let subscribeFile: string | undefined;
  let captionStyleKey: CaptionStyleKey | undefined;
  const disclaimerText = input.disclaimerText?.trim();
  const descriptionDisclaimerText = input.descriptionDisclaimerText?.trim();
  const showDisclaimer = input.showDisclaimer === true;
  const showChannelAvatar = input.showChannelAvatar === true;

  if (isReupAudioChannelType(input.type)) {
    if (!input.reupAudioVideoType) {
      throw new AppError('Video type is required for Reup Audio channels', 400, 'VALIDATION_ERROR');
    }
    reupAudioVideoType = input.reupAudioVideoType;
    useReferenceImage = input.useReferenceImage === true;

    if (input.reupAudioVideoType === 'ai') {
      if (!input.reupAudioVisualStyleId?.trim()) {
        throw new AppError('Video style is required for Animate Images (AI)', 400, 'VALIDATION_ERROR');
      }
      validateReupAudioVisualStyleId(
        input.reupAudioVideoType,
        input.reupAudioVisualStyleId.trim(),
        input.language,
      );
      reupAudioVisualStyleId = input.reupAudioVisualStyleId.trim();
      aiSceneDensityMaxSec = resolveAiSceneDensityMaxSec(input.aiSceneDensityMaxSec);
    } else if (input.reupAudioVideoType === 'si') {
      if (!input.reupAudioBackgroundImage) {
        throw new AppError(
          'Background image is required for Stock Video + Image',
          400,
          'VALIDATION_ERROR',
        );
      }
      reupAudioBackgroundImage = input.reupAudioBackgroundImage;
      const selectedAudioBar = input.audioBarFile?.trim();
      if (selectedAudioBar === SI_OVERLAY_AUTO_SENTINEL) {
        audioBarFile = SI_OVERLAY_AUTO_SENTINEL;
        showAudioBar = true;
      } else if (selectedAudioBar) {
        assetsService.getAsset('audioBar', selectedAudioBar);
        audioBarFile = selectedAudioBar;
        showAudioBar = true;
      } else {
        showAudioBar = input.showAudioBar === true;
      }

      const selectedSmallVideo = input.smallVideoFile?.trim();
      if (selectedSmallVideo === SI_OVERLAY_AUTO_SENTINEL) {
        smallVideoFile = SI_OVERLAY_AUTO_SENTINEL;
        showSmallVideo = true;
      } else if (selectedSmallVideo) {
        assetsService.getAsset('smallVideo', selectedSmallVideo);
        smallVideoFile = selectedSmallVideo;
        showSmallVideo = true;
      } else {
        showSmallVideo = input.showSmallVideo === true;
      }

      const selectedSubscribe = input.subscribeFile?.trim();
      if (selectedSubscribe === SI_OVERLAY_AUTO_SENTINEL) {
        subscribeFile = SI_OVERLAY_AUTO_SENTINEL;
        showSubscribe = true;
      } else if (selectedSubscribe) {
        assetsService.getAsset('subscribe', selectedSubscribe);
        subscribeFile = selectedSubscribe;
        showSubscribe = true;
      } else {
        showSubscribe = false;
      }

      const needsVisualStyle =
        input.reupAudioBackgroundImage === 'multi_image' || input.useReferenceImage === true;
      if (needsVisualStyle) {
        if (!input.reupAudioVisualStyleId?.trim()) {
          throw new AppError(
            'Video style is required for Stock Video + multi image / reference images',
            400,
            'VALIDATION_ERROR',
          );
        }
        validateReupAudioVisualStyleId(
          input.reupAudioVideoType,
          input.reupAudioVisualStyleId.trim(),
          input.language,
        );
        reupAudioVisualStyleId = input.reupAudioVisualStyleId.trim();
      } else if (input.reupAudioVisualStyleId?.trim()) {
        validateReupAudioVisualStyleId(
          input.reupAudioVideoType,
          input.reupAudioVisualStyleId.trim(),
          input.language,
        );
        reupAudioVisualStyleId = input.reupAudioVisualStyleId.trim();
      }

      if (input.reupAudioBackgroundImage === 'multi_image') {
        aiSceneDensityMaxSec = resolveAiSceneDensityMaxSec(input.aiSceneDensityMaxSec);
      }
    }

    if (useReferenceImage && !reupAudioVisualStyleId) {
      throw new AppError(
        'Video style is required when using reference images',
        400,
        'VALIDATION_ERROR',
      );
    }
    captionStyleKey = assertValidCaptionStyleKey(input.captionStyleKey);
  }

  return {
    linkedEmail,
    sourceChannels,
    uploadSchedule,
    ...(isReupChannelType(input.type)
      ? { videoCreationOrder: input.videoCreationOrder ?? 'oldest_first' }
      : {}),
    ...(backgroundFootageMode === 'local'
      ? { backgroundFootageMode: 'local' as const }
      : backgroundFootageSources.length > 0
        ? { backgroundFootageSources }
        : {}),
    ...(thumbnailStyleKey ? { thumbnailStyleKey } : {}),
    ...(captionStyleKey ? { captionStyleKey } : {}),
    ...(reupAudioVideoType ? { reupAudioVideoType } : {}),
    ...(reupAudioVisualStyleId ? { reupAudioVisualStyleId } : {}),
    ...(reupAudioBackgroundImage ? { reupAudioBackgroundImage } : {}),
    ...(aiSceneDensityMaxSec ? { aiSceneDensityMaxSec } : {}),
    ...(useReferenceImage ? { useReferenceImage: true } : {}),
    ...(showAudioBar ? { showAudioBar: true } : {}),
    ...(audioBarFile ? { audioBarFile } : {}),
    ...(showChannelAvatar ? { showChannelAvatar: true } : {}),
    ...(showSubscribe ? { showSubscribe: true } : {}),
    ...(showSmallVideo ? { showSmallVideo: true } : {}),
    ...(smallVideoFile ? { smallVideoFile } : {}),
    ...(subscribeFile ? { subscribeFile } : {}),
    ...(showDisclaimer ? { showDisclaimer: true } : {}),
    ...(disclaimerText ? { disclaimerText } : {}),
    ...(descriptionDisclaimerText ? { descriptionDisclaimerText } : {}),
  };
}

function assertEmailAvailableForChannel(email: string, channelId?: string): void {
  if (isDefaultLinkedEmail(email)) return;

  const normalized = email.toLowerCase();
  const taken = youtubeChannelsRepository
    .findAll()
    .some((c) => c.id !== channelId && c.linkedEmail.toLowerCase() === normalized);
  if (taken) {
    throw new AppError('Email already linked to another channel', 400, 'DUPLICATE_EMAIL');
  }
}

function isDefaultLinkedEmail(email: string): boolean {
  return email.toLowerCase() === 'default';
}

/** Stable-sort: Default-linked channels first, preserve relative order of the rest. */
function prioritizeDefaultChannels(channels: YoutubeChannel[]): YoutubeChannel[] {
  const defaults: YoutubeChannel[] = [];
  const others: YoutubeChannel[] = [];
  for (const channel of channels) {
    if (isDefaultLinkedEmail(channel.linkedEmail)) {
      defaults.push(channel);
    } else {
      others.push(channel);
    }
  }
  return [...defaults, ...others];
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
    const ordered = prioritizeDefaultChannels(filtered);
    const result = paginate(ordered, page, limit);
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
      nextUploadAt: getNextYoutubePublishSlot(channel)?.iso ?? null,
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
        nextUploadAt: getNextYoutubePublishSlot(channel)?.iso ?? null,
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
      nextUploadAt: getNextYoutubePublishSlot(updated)?.iso ?? null,
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

    let videos: YoutubeChannelVideo[];
    try {
      videos = await this.fetchVideos(channel);
    } catch {
      return { items: this.mergeVideosWithPrepare(id, []) };
    }

    const fetchedAt = this.persistVideos(id, videos);
    return { items: this.mergeVideosWithPrepare(id, videos), fetchedAt };
  }

  deleteVideos(id: string, videoIds: string[]): { deleted: string[] } {
    this.getById(id);

    const requested = [...new Set(videoIds.map(videoId => videoId.trim()).filter(Boolean))];
    if (requested.length === 0) {
      throw new AppError('No video IDs provided', 400, 'VALIDATION_ERROR');
    }

    const prepareIds = videoPrepareRepository.getPreparedVideoIds(id);
    const deletable = requested.filter(videoId => prepareIds.has(videoId));
    if (deletable.length === 0) {
      throw new AppError(
        'No deletable videos found (Published videos cannot be deleted)',
        400,
        'NO_DELETABLE_VIDEOS',
      );
    }

    for (const videoId of deletable) {
      const folder = resolveYoutubeChannelVideoDir(id, videoId);
      if (folder) {
        fs.rmSync(folder, { recursive: true, force: true });
      }
    }

    const deleted = videoPrepareRepository.removeByVideoIds(id, deletable);
    return { deleted };
  }

  deleteAllUploadedVideoFolders(): { channelsProcessed: number; deletedFolders: number } {
    const channels = youtubeChannelsRepository.findAll();
    let deletedFolders = 0;

    for (const channel of channels) {
      const uploadsDir = youtubeChannelUploadsDir(channel.id);
      if (!fs.existsSync(uploadsDir)) continue;

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(uploadsDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        fs.rmSync(path.join(uploadsDir, entry.name), { recursive: true, force: true });
        deletedFolders += 1;
      }
    }

    return { channelsProcessed: channels.length, deletedFolders };
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

    if (!input.niche.trim()) {
      throw new AppError('Niche is required');
    }
    if (!nichesService.exists(input.niche)) {
      throw new AppError('Niche not found', 400, 'INVALID_NICHE');
    }

    let name = '';
    let handle = '';
    let youtubeUrl = '';
    let channelId: string | undefined = undefined;

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
      niche: input.niche,
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
      ...(config.videoCreationOrder ? { videoCreationOrder: config.videoCreationOrder } : {}),
      ...(config.backgroundFootageMode === 'local'
        ? { backgroundFootageMode: 'local' as const }
        : config.backgroundFootageSources?.length
          ? { backgroundFootageSources: config.backgroundFootageSources }
          : {}),
      ...(config.thumbnailStyleKey ? { thumbnailStyleKey: config.thumbnailStyleKey } : {}),
      ...(config.captionStyleKey ? { captionStyleKey: config.captionStyleKey } : {}),
      ...(config.reupAudioVideoType ? { reupAudioVideoType: config.reupAudioVideoType } : {}),
      ...(config.reupAudioVisualStyleId
        ? { reupAudioVisualStyleId: config.reupAudioVisualStyleId }
        : {}),
      ...(config.reupAudioBackgroundImage
        ? { reupAudioBackgroundImage: config.reupAudioBackgroundImage }
        : {}),
      ...(config.aiSceneDensityMaxSec ? { aiSceneDensityMaxSec: config.aiSceneDensityMaxSec } : {}),
      ...(config.useReferenceImage ? { useReferenceImage: true } : {}),
      ...(config.showAudioBar ? { showAudioBar: true } : {}),
      ...(config.audioBarFile ? { audioBarFile: config.audioBarFile } : {}),
      ...(config.showChannelAvatar ? { showChannelAvatar: true } : {}),
      ...(config.showSubscribe ? { showSubscribe: true } : {}),
      ...(config.showSmallVideo ? { showSmallVideo: true } : {}),
      ...(config.smallVideoFile ? { smallVideoFile: config.smallVideoFile } : {}),
      ...(config.subscribeFile ? { subscribeFile: config.subscribeFile } : {}),
      ...(config.showDisclaimer ? { showDisclaimer: true } : {}),
      ...(config.disclaimerText ? { disclaimerText: config.disclaimerText } : {}),
      ...(config.descriptionDisclaimerText
        ? { descriptionDisclaimerText: config.descriptionDisclaimerText }
        : {}),
    };

    if (input.thumbnailBackgroundTempSessionId?.trim()) {
      thumbnailBackgroundsService.moveTempToChannel(
        input.thumbnailBackgroundTempSessionId.trim(),
        channel.id,
      );
    }
    if (input.avatarTempSessionId?.trim()) {
      channelAvatarsService.moveTempToChannel(input.avatarTempSessionId.trim(), channel.id);
    }

    const selectedBackground = input.thumbnailBackgroundFile?.trim();
    if (selectedBackground) {
      channel.thumbnailBackgroundFile = thumbnailBackgroundsService.assertChannelFile(
        channel.id,
        selectedBackground,
      );
    }

    return youtubeChannelsRepository.prepend(channel);
  }

  async update(id: string, input: UpdateYoutubeChannelInput): Promise<YoutubeChannel> {
    const current = this.getById(id);
    const config = validateChannelConfig(input);
    assertEmailAvailableForChannel(config.linkedEmail, id);

    if (!input.niche.trim()) {
      throw new AppError('Niche is required');
    }
    if (!nichesService.exists(input.niche)) {
      throw new AppError('Niche not found', 400, 'INVALID_NICHE');
    }

    const channelUrl = input.channelUrl?.trim() ?? '';
    if (channelUrl && !isDefaultLinkedEmail(current.linkedEmail)) {
      throw new AppError(
        'Channel URL can only be updated when linked email is default',
        400,
        'CHANNEL_URL_LOCKED',
      );
    }

    let identityUpdate:
      | { name: string; handle: string; youtubeUrl: string; channelId: string }
      | undefined;

    if (channelUrl && isDefaultLinkedEmail(current.linkedEmail)) {
      const { platform, fullUrl } = parseSourceUrl(channelUrl);
      if (platform !== 'youtube') {
        throw new AppError('Channel URL must be a YouTube link', 400, 'INVALID_PLATFORM');
      }

      const canonicalUrl = canonicalizeSourceUrl(fullUrl);
      const exists = youtubeChannelsRepository
        .findAll()
        .some((c) => c.id !== id && canonicalizeSourceUrl(c.youtubeUrl) === canonicalUrl);
      if (exists) {
        throw new AppError('YouTube channel already exists', 400, 'DUPLICATE_CHANNEL');
      }

      try {
        const metadata = await fetchYoutubeChannelMetadata(fullUrl);
        const duplicateById = youtubeChannelsRepository
          .findAll()
          .some((c) => c.id !== id && c.channelId && c.channelId === metadata.channelId);
        if (duplicateById) {
          throw new AppError('YouTube channel already exists', 400, 'DUPLICATE_CHANNEL');
        }

        const handle = metadata.handle.startsWith('@') ? metadata.handle : `@${metadata.handle}`;
        identityUpdate = {
          name: metadata.name,
          handle,
          youtubeUrl: `https://youtube.com/${handle}`,
          channelId: metadata.channelId,
        };
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

    const updated = youtubeChannelsRepository.update(id, (existing) => {
      const next: YoutubeChannel = {
        ...existing,
        type: input.type,
        language: input.language,
        niche: input.niche,
        linkedEmail: config.linkedEmail,
        sourceChannels: config.sourceChannels,
        uploadSchedule: config.uploadSchedule,
        uploadFrequency: input.uploadFrequency,
      };

      if (identityUpdate) {
        next.name = identityUpdate.name;
        next.handle = identityUpdate.handle;
        next.youtubeUrl = identityUpdate.youtubeUrl;
        next.channelId = identityUpdate.channelId;
      }

      if (config.videoCreationOrder) {
        next.videoCreationOrder = config.videoCreationOrder;
      } else {
        delete next.videoCreationOrder;
      }

      if (config.backgroundFootageMode === 'local') {
        next.backgroundFootageMode = 'local';
        delete next.backgroundFootageSources;
      } else {
        delete next.backgroundFootageMode;
        if (config.backgroundFootageSources?.length) {
          next.backgroundFootageSources = config.backgroundFootageSources;
        } else {
          delete next.backgroundFootageSources;
        }
      }

      if (config.thumbnailStyleKey) {
        next.thumbnailStyleKey = config.thumbnailStyleKey;
      } else {
        delete next.thumbnailStyleKey;
      }

      const selectedBackground = input.thumbnailBackgroundFile?.trim();
      if (selectedBackground) {
        next.thumbnailBackgroundFile = thumbnailBackgroundsService.assertChannelFile(
          id,
          selectedBackground,
        );
      } else {
        delete next.thumbnailBackgroundFile;
      }

      if (config.showDisclaimer) {
        next.showDisclaimer = true;
      } else {
        delete next.showDisclaimer;
      }
      if (config.showChannelAvatar) {
        next.showChannelAvatar = true;
      } else {
        delete next.showChannelAvatar;
      }
      if (config.showSubscribe) {
        next.showSubscribe = true;
      } else {
        delete next.showSubscribe;
      }
      if (config.disclaimerText) {
        next.disclaimerText = config.disclaimerText;
      } else {
        delete next.disclaimerText;
      }
      if (config.descriptionDisclaimerText) {
        next.descriptionDisclaimerText = config.descriptionDisclaimerText;
      } else {
        delete next.descriptionDisclaimerText;
      }

      if (isReupAudioChannelType(input.type)) {
        next.reupAudioVideoType = config.reupAudioVideoType;
        if (config.reupAudioVisualStyleId) {
          next.reupAudioVisualStyleId = config.reupAudioVisualStyleId;
        } else {
          delete next.reupAudioVisualStyleId;
        }
        if (config.reupAudioBackgroundImage) {
          next.reupAudioBackgroundImage = config.reupAudioBackgroundImage;
        } else {
          delete next.reupAudioBackgroundImage;
        }
        if (config.aiSceneDensityMaxSec) {
          next.aiSceneDensityMaxSec = config.aiSceneDensityMaxSec;
        } else {
          delete next.aiSceneDensityMaxSec;
        }
        if (config.useReferenceImage) {
          next.useReferenceImage = true;
        } else {
          delete next.useReferenceImage;
        }
        if (config.reupAudioVideoType === 'si' && config.showAudioBar) {
          next.showAudioBar = true;
        } else {
          delete next.showAudioBar;
        }
        if (config.reupAudioVideoType === 'si' && config.audioBarFile) {
          next.audioBarFile = config.audioBarFile;
        } else {
          delete next.audioBarFile;
        }
        if (config.reupAudioVideoType === 'si' && config.showSmallVideo) {
          next.showSmallVideo = true;
        } else {
          delete next.showSmallVideo;
        }
        if (config.reupAudioVideoType === 'si' && config.smallVideoFile) {
          next.smallVideoFile = config.smallVideoFile;
        } else {
          delete next.smallVideoFile;
        }
        if (config.reupAudioVideoType === 'si' && config.subscribeFile) {
          next.subscribeFile = config.subscribeFile;
        } else {
          delete next.subscribeFile;
        }
        if (config.captionStyleKey) {
          next.captionStyleKey = config.captionStyleKey;
        } else {
          delete next.captionStyleKey;
        }
      } else {
        delete next.reupAudioVideoType;
        delete next.reupAudioVisualStyleId;
        delete next.reupAudioBackgroundImage;
        delete next.aiSceneDensityMaxSec;
        delete next.useReferenceImage;
        delete next.showAudioBar;
        delete next.audioBarFile;
        delete next.showSmallVideo;
        delete next.smallVideoFile;
        delete next.subscribeFile;
        delete next.captionStyleKey;
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
