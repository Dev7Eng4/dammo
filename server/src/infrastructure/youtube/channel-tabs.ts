export type ChannelTab = 'videos' | 'shorts' | 'streams' | 'featured';

const KNOWN_TAB_SUFFIX = /\/(videos|shorts|streams|featured)$/i;

/** Channel URL without a trailing slash or tab segment (…/videos, …/shorts, …). */
export function stripChannelTab(channelUrl: string): string {
  return channelUrl.trim().replace(/\/+$/, '').replace(KNOWN_TAB_SUFFIX, '');
}

export function buildChannelTabUrl(channelUrl: string, tab: ChannelTab): string {
  return `${stripChannelTab(channelUrl)}/${tab}`;
}

/**
 * yt-dlp fails with "This channel does not have a videos tab" (also shorts/streams) when a channel
 * has no content of that kind — typically a brand new channel or one with only Shorts. That is an
 * empty result, not a failed sync.
 */
export function isMissingChannelTabError(message: string): boolean {
  return /does not have an? (videos|shorts|streams|featured|live|home) tab/i.test(message);
}

/** Tabs to try, in order, when the videos tab is missing. */
export const VIDEO_FALLBACK_TABS: readonly ChannelTab[] = ['shorts', 'streams'];

/** Tabs to try, in order, to read channel metadata when the videos tab is missing. */
export const METADATA_FALLBACK_TABS: readonly ChannelTab[] = ['featured', 'shorts', 'streams'];
