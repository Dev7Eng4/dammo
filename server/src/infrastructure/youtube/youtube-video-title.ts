import { AppError } from '../../shared/http/errors.js';
import { getYoutubeDlCommonOptions } from './youtube-dl-auth.js';
import { toYoutubeDlError } from './youtube-dl-error.js';
import { youtubeDl } from './youtube-dl-client.js';
import { requireYoutubeVideoId } from './youtube-url.js';

function parseTitle(raw: unknown): string {
  const data =
    typeof raw === 'string'
      ? (() => {
          try {
            return JSON.parse(raw) as Record<string, unknown>;
          } catch {
            return null;
          }
        })()
      : raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null;

  const title = typeof data?.title === 'string' ? data.title.trim() : '';
  return title;
}

export async function fetchYoutubeVideoTitle(url: string): Promise<string> {
  requireYoutubeVideoId(url);

  try {
    const raw = await youtubeDl(url, {
      ...getYoutubeDlCommonOptions(),
      dumpSingleJson: true,
      skipDownload: true,
    });
    const title = parseTitle(raw);
    if (!title) {
      throw new AppError('Could not fetch video title', 404, 'VIDEO_TITLE_NOT_FOUND');
    }
    return title;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw toYoutubeDlError(err, 'Failed to fetch YouTube video title');
  }
}
