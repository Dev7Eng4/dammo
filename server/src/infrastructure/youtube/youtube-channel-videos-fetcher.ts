import { youtubeDl } from 'youtube-dl-exec';
import type { YoutubeChannelVideo, YtdlpChannelResponse, YtdlpVideoEntry } from './youtube-channel.types.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function buildVideosTabUrl(channelUrl: string): string {
  const trimmed = channelUrl.replace(/\/$/, '');
  if (trimmed.endsWith('/videos')) return trimmed;
  return `${trimmed}/videos`;
}

function mapVideoEntry(entry: YtdlpVideoEntry): YoutubeChannelVideo | null {
  const id = entry.id;
  const title = entry.title?.trim();
  if (!id || !title) return null;

  const url = entry.webpage_url ?? entry.url ?? `https://www.youtube.com/watch?v=${id}`;

  return {
    id,
    title,
    url,
    viewCount: entry.view_count,
    duration: entry.duration,
  };
}

function mapPlaylistEntries(entries: YtdlpVideoEntry[]): YoutubeChannelVideo[] {
  return entries
    .map(mapVideoEntry)
    .filter((video): video is YoutubeChannelVideo => video !== null);
}

async function fetchPlaylistVideos(
  channelUrl: string,
  options?: { playlistEnd?: number },
): Promise<YoutubeChannelVideo[]> {
  try {
    const raw = await youtubeDl(buildVideosTabUrl(channelUrl), {
      dumpSingleJson: true,
      flatPlaylist: false,
      skipDownload: true,
      noWarnings: true,
      ...(options?.playlistEnd !== undefined ? { playlistEnd: options.playlistEnd } : {}),
    });

    const data = raw as YtdlpChannelResponse;
    return mapPlaylistEntries(data.entries ?? []);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown yt-dlp error';
    throw new Error(message);
  }
}

export async function fetchYoutubeChannelVideos(
  channelUrl: string,
  limit = DEFAULT_LIMIT,
): Promise<YoutubeChannelVideo[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
  return fetchPlaylistVideos(channelUrl, { playlistEnd: cappedLimit });
}

export async function fetchAllYoutubeChannelVideos(
  channelUrl: string,
): Promise<YoutubeChannelVideo[]> {
  return fetchPlaylistVideos(channelUrl);
}
