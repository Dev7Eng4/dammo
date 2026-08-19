import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../../shared/http/errors.js';
import { requireYoutubeVideoId } from '../youtube-url.js';
import { getYoutubeiClient, toYoutubeiError } from './youtubei-client.js';
import { writeYoutubeiStreamToFile } from './youtubei-stream.js';

export async function downloadYoutubeAudioWithYoutubei(url: string, outputDir: string): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const videoId = requireYoutubeVideoId(url);

  const mp3Path = path.join(outputDir, 'audio.mp3');

  try {
    const yt = await getYoutubeiClient();

    await fs.unlink(mp3Path).catch(() => undefined);

    const stream = await yt.download(videoId, {
      type: 'audio',
      client: 'ANDROID',
    });
    await writeYoutubeiStreamToFile(stream, mp3Path);
    await fs.access(mp3Path);
    return mp3Path;
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('ffmpeg not found')) {
      throw new AppError(err.message, 500, 'FFMPEG_NOT_FOUND');
    }
    throw toYoutubeiError(err, 'Failed to download YouTube audio');
  }
}
