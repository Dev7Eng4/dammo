import fs from 'node:fs/promises';
import path from 'node:path';
import { assertMediaFileComplete, formatClockDuration, getMediaDurationSeconds } from '../../ffmpeg/ffmpeg-probe.js';
import { runFfmpeg } from '../../ffmpeg/ffmpeg-runner.js';
import { AppError } from '../../../shared/http/errors.js';
import { requireYoutubeVideoId } from '../youtube-url.js';
import { getYoutubeiClient, toYoutubeiError } from './youtubei-client.js';
import { writeYoutubeiStreamToFile } from './youtubei-stream.js';

/**
 * The muxed 360p track is the only thing this library can still pull in full.
 * Adaptive audio-only URLs are gated behind a PO token and answer 403 after the
 * first mebibyte, and `type: 'audio'` takes youtubei's chunked path, whose loop
 * ends after one 10 MiB slice when the format carries no `content_length` —
 * producing a 10 MiB + 1 byte file that still advertises the full duration.
 * `video+audio` without a range is a single plain GET, so none of that applies;
 * the extra video bytes are discarded during the transcode below.
 */
const DOWNLOAD_TYPE = 'video+audio' as const;
const CLIENT = 'ANDROID' as const;

/** Slack against the duration YouTube reports for the video, in seconds. */
const DURATION_TOLERANCE_SEC = 5;

export async function downloadYoutubeAudioWithYoutubei(url: string, outputDir: string): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const videoId = requireYoutubeVideoId(url);

  const mp3Path = path.join(outputDir, 'audio.mp3');
  const rawPath = path.join(outputDir, `audio.${videoId}.download`);

  try {
    const yt = await getYoutubeiClient();
    const info = await yt.getBasicInfo(videoId, { client: CLIENT });

    await fs.rm(rawPath, { force: true });
    const stream = await info.download({ type: DOWNLOAD_TYPE, client: CLIENT });
    await writeYoutubeiStreamToFile(stream, rawPath);
    await assertMediaFileComplete(rawPath, { label: `bản tải của ${videoId}` });

    await fs.rm(mp3Path, { force: true });
    await runFfmpeg(['-hide_banner', '-y', '-i', rawPath, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', mp3Path], {
      label: 'youtubei-audio-mp3',
    });
    await assertMediaFileComplete(mp3Path, { label: 'audio.mp3' });

    const expectedSec = info.basic_info.duration ?? 0;
    const actualSec = await getMediaDurationSeconds(mp3Path);
    if (expectedSec > 0 && expectedSec - actualSec > DURATION_TOLERANCE_SEC) {
      throw new AppError(
        `audio.mp3 ngắn hơn video gốc: ${formatClockDuration(actualSec)} / ${formatClockDuration(expectedSec)}`,
        502,
        'MEDIA_FILE_INCOMPLETE',
      );
    }

    return mp3Path;
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('ffmpeg not found')) {
      throw new AppError(err.message, 500, 'FFMPEG_NOT_FOUND');
    }
    throw toYoutubeiError(err, 'Failed to download YouTube audio');
  } finally {
    await fs.rm(rawPath, { force: true }).catch(() => undefined);
  }
}
