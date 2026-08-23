import fs from 'node:fs';
import { create as createYoutubeDl, youtubeDl as defaultYoutubeDl } from 'youtube-dl-exec';
import { env } from '../../config/env.js';
import { disableBrowserCookies, isBrowserCookieError } from './youtube-dl-auth.js';
import { extractYoutubeDlDetail } from './youtube-dl-error.js';

type YoutubeDlClient = typeof defaultYoutubeDl;
type YoutubeDlArgs = Parameters<YoutubeDlClient>;

type ResolvedYoutubeDl = {
  client: YoutubeDlClient;
  source: 'custom' | 'bundled';
  path: string | null;
};

function resolveYoutubeDl(): ResolvedYoutubeDl {
  const customPath = env.ytDlpPath.trim();
  if (customPath && fs.existsSync(customPath)) {
    return { client: createYoutubeDl(customPath) as YoutubeDlClient, source: 'custom', path: customPath };
  }
  return { client: defaultYoutubeDl, source: 'bundled', path: null };
}

const resolved = resolveYoutubeDl();

function withoutBrowserCookies(flags: YoutubeDlArgs[1]): YoutubeDlArgs[1] {
  if (!flags) return flags;
  const { cookiesFromBrowser: _dropped, ...rest } = flags as Record<string, unknown>;
  return rest as YoutubeDlArgs[1];
}

/**
 * A running browser locks its cookie DB, so `--cookies-from-browser` fails every
 * call. Retry once without cookies instead of failing the whole download chain.
 */
async function runYoutubeDl(...args: YoutubeDlArgs): ReturnType<YoutubeDlClient> {
  const [url, flags, options] = args;

  try {
    return await resolved.client(url, flags, options);
  } catch (err) {
    const detail = extractYoutubeDlDetail(err);
    if (!isBrowserCookieError(detail)) throw err;

    disableBrowserCookies('không copy được cookie database của browser');
    return await resolved.client(url, withoutBrowserCookies(flags), options);
  }
}

export const youtubeDl = runYoutubeDl;

export function getResolvedYtDlpInfo(): Readonly<ResolvedYoutubeDl> {
  return resolved;
}
