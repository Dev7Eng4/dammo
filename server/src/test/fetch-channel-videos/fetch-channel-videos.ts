import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchYoutubeChannelMetadata } from '../../infrastructure/youtube/youtube-channel-fetcher.js';
import { fetchAllYoutubeChannelVideos } from '../../infrastructure/youtube/youtube-channel-videos-fetcher.js';
import type { YoutubeChannelMetadata, YoutubeChannelVideo } from '../../infrastructure/youtube/youtube-channel.types.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(TEST_DIR, 'channel-videos.json');

/** Edit then run: npm run test:fetch-channel-videos */
const CHANNEL_URL = 'https://www.youtube.com/@kokoroshimiru-kando';

export interface FetchChannelVideosResult {
  channelUrl: string;
  fetchedAt: string;
  channel: YoutubeChannelMetadata;
  videoCount: number;
  videos: YoutubeChannelVideo[];
}

export async function fetchChannelInfoAndVideos(channelUrl: string): Promise<FetchChannelVideosResult> {
  const [channel, videos] = await Promise.all([
    fetchYoutubeChannelMetadata(channelUrl),
    fetchAllYoutubeChannelVideos(channelUrl),
  ]);

  return {
    channelUrl,
    fetchedAt: new Date().toISOString(),
    channel,
    videoCount: videos.length,
    videos,
  };
}

async function main(): Promise<void> {
  console.log(`[fetch-channel] Channel: ${CHANNEL_URL}`);
  console.log('[fetch-channel] Fetching metadata + public video links...');

  const result = await fetchChannelInfoAndVideos(CHANNEL_URL);

  console.log('\n--- Channel ---');
  console.log(`Name:        ${result.channel.name}`);
  console.log(`Handle:      ${result.channel.handle}`);
  console.log(`Channel ID:  ${result.channel.channelId ?? '(none)'}`);
  console.log(`Subscribers: ${result.channel.subscriberCount ?? '(unknown)'}`);
  console.log(`Video count: ${result.channel.videoCount ?? result.videoCount}`);
  console.log(`Niche:       ${result.channel.niche}`);
  if (result.channel.description) {
    const preview = result.channel.description.replace(/\s+/g, ' ').slice(0, 160);
    console.log(`Description: ${preview}${result.channel.description.length > 160 ? '…' : ''}`);
  }

  console.log(`\n--- Public videos (${result.videoCount}) ---`);
  for (const video of result.videos) {
    console.log(`${video.url}  |  ${video.title}`);
  }

  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`\n[fetch-channel] Wrote ${OUTPUT_FILE}`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
