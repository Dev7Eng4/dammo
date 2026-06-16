import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import { parseSourceUrl } from '../../shared/platform/url-parser.js';
import { paginate } from '../../shared/types/pagination.js';
import { fetchYoutubeChannelMetadata } from '../../infrastructure/youtube/youtube-channel-fetcher.js';
import { mailAccountsRepository } from '../mail-accounts/mail-accounts.repository.js';
import { sourceChannelsRepository } from '../source-channels/source-channels.repository.js';
import { youtubeChannelsRepository } from './youtube-channels.repository.js';
import type {
  CreateYoutubeChannelInput,
  MonetizationStatus,
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
    return paginate(filtered, page, limit);
  }

  getById(id: string): YoutubeChannel {
    const channel = youtubeChannelsRepository.findById(id);
    if (!channel) {
      throw new AppError('Channel not found', 404, 'NOT_FOUND');
    }
    return channel;
  }

  async create(input: CreateYoutubeChannelInput): Promise<YoutubeChannel> {
    const mailAccount = mailAccountsRepository.findById(input.mailAccountId);
    if (!mailAccount) {
      throw new AppError('Mail account not found', 404, 'MAIL_NOT_FOUND');
    }

    const source = sourceChannelsRepository.findById(input.sourceChannelId);
    if (!source) {
      throw new AppError('Source channel not found', 404, 'SOURCE_NOT_FOUND');
    }

    const { platform, fullUrl } = parseSourceUrl(input.channelUrl);
    if (platform !== 'youtube') {
      throw new AppError('Channel URL must be a YouTube link', 400, 'INVALID_PLATFORM');
    }

    const exists = youtubeChannelsRepository
      .findAll()
      .some((c) => c.youtubeUrl.toLowerCase() === fullUrl.toLowerCase());
    if (exists) {
      throw new AppError('YouTube channel already exists', 400, 'DUPLICATE_CHANNEL');
    }

    try {
      const metadata = await fetchYoutubeChannelMetadata(fullUrl);
      const handle = metadata.handle.startsWith('@') ? metadata.handle : `@${metadata.handle}`;

      const channel: YoutubeChannel = {
        id: generateId(),
        name: metadata.name,
        handle,
        youtubeUrl: fullUrl,
        type: 'own_content',
        niche: metadata.niche,
        language: 'EN-US',
        monetizationStatus: 'in_review',
        healthScore: 'medium',
        status: 'active',
        linkedEmail: mailAccount.email,
        uploadSchedule: '',
        sourceMapping: source.fullUrl,
        contentProjectId: buildProjectId(handle),
        recentActivity: [],
        createdAt: new Date().toISOString(),
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
}

export const youtubeChannelsService = new YoutubeChannelsService();
