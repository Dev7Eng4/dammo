import fs from 'node:fs/promises';
import { Innertube } from 'youtubei.js';
import { env } from '../../../config/env.js';
import { AppError } from '../../../shared/http/errors.js';

let innertubePromise: Promise<Innertube> | null = null;

function parseNetscapeCookies(content: string): string {
  const pairs: string[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#HttpOnly_')) {
      line = line.slice('#HttpOnly_'.length);
    } else if (line.startsWith('#')) {
      continue;
    }

    const parts = line.split('\t');
    if (parts.length < 7) continue;

    const domain = parts[0] ?? '';
    const name = parts[5];
    const value = parts[6];
    if (!name || value === undefined) continue;
    if (!domain.includes('youtube.com') && !domain.includes('google.com')) continue;
    pairs.push(`${name}=${value}`);
  }

  return pairs.join('; ');
}

async function loadYoutubeCookies(): Promise<string | undefined> {
  const filePath = env.youtubeCookiesFile.trim();
  if (!filePath) return undefined;

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const cookie = parseNetscapeCookies(content);
    return cookie || undefined;
  } catch {
    return undefined;
  }
}

async function createYoutubeiClient(): Promise<Innertube> {
  // const cookie = await loadYoutubeCookies();
  // return Innertube.create({
  //   cookie,
  //   retrieve_player: true,
  // });

  return Innertube.create();
}

export function getYoutubeiClient(): Promise<Innertube> {
  if (!innertubePromise) {
    innertubePromise = createYoutubeiClient().catch(err => {
      innertubePromise = null;
      throw err;
    });
  }
  return innertubePromise;
}

export function toYoutubeiError(err: unknown, action: string): AppError {
  if (err instanceof AppError) return err;
  const message = err instanceof Error && err.message.trim() ? err.message : String(err);
  return new AppError(`${action}: ${message}`, 502, 'YOUTUBE_DOWNLOAD_FAILED');
}
