import fs from 'node:fs/promises';
import path from 'node:path';
import { youtubeDl } from './youtube-dl-client.js';
import { AppError } from '../../shared/http/errors.js';
import { getYoutubeDlCommonOptions } from './youtube-dl-auth.js';
import { findSubtitleFile, renameToCanonical } from './youtube-download-utils.js';
import { toYoutubeDlError } from './youtube-dl-error.js';
import { requireYoutubeVideoId } from './youtube-url.js';

export type TranscriptLanguage = 'en' | 'ko' | 'ja' | 'es';

export const DEFAULT_TRANSCRIPT_LANGUAGE: TranscriptLanguage = 'ja';

async function tryDownloadSubs(
  url: string,
  outputDir: string,
  language: TranscriptLanguage,
  autoOnly: boolean,
): Promise<string | null> {
  const outputTemplate = path.join(outputDir, 'transcript.%(ext)s');

  await youtubeDl(url, {
    ...getYoutubeDlCommonOptions(),
    output: outputTemplate,
    skipDownload: true,
    writeSub: !autoOnly,
    writeAutoSub: true,
    subLang: language,
    subFormat: 'vtt',
    ignoreErrors: false,
  });

  return findSubtitleFile(outputDir, language);
}

export async function downloadYoutubeTranscript(
  url: string,
  outputDir: string,
  language: TranscriptLanguage,
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  requireYoutubeVideoId(url);

  try {
    let subtitlePath = await tryDownloadSubs(url, outputDir, language, false);
    if (!subtitlePath) {
      subtitlePath = await tryDownloadSubs(url, outputDir, language, true);
    }

    if (!subtitlePath) {
      throw new AppError(
        `Transcript not found for language "${language}"`,
        404,
        'TRANSCRIPT_NOT_FOUND',
      );
    }

    const ext = path.extname(subtitlePath);
    const canonicalPath = path.join(outputDir, `transcript.${language}${ext}`);
    return renameToCanonical(subtitlePath, canonicalPath);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw toYoutubeDlError(err, 'Failed to download YouTube transcript');
  }
}
