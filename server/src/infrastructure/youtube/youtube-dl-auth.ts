import { env } from '../../config/env.js';

export type YoutubeDlAuthOptions = {
  cookies?: string;
  cookiesFromBrowser?: string;
};

export type YoutubeDlCommonOptions = YoutubeDlAuthOptions & {
  noCheckCertificates: true;
  noWarnings: true;
  addHeader: string[];
};

export type YoutubeDlPublicOptions = {
  dumpSingleJson: true;
  flatPlaylist: true;
  skipDownload: true;
  noCheckCertificates: true;
  noWarnings: true;
  ignoreErrors: true;
  addHeader: string[];
};

/**
 * yt-dlp cannot copy the browser cookie DB while the browser is running, and the
 * error repeats for every call. Once seen, browser cookies stay off until restart.
 */
let browserCookiesDisabled = false;

export function isBrowserCookieError(detail: string): boolean {
  const haystack = detail.toLowerCase();
  if (!haystack.includes('cookie')) return false;
  return (
    haystack.includes('could not copy') ||
    haystack.includes('could not find') ||
    haystack.includes('permission denied')
  );
}

export function disableBrowserCookies(reason: string): boolean {
  if (browserCookiesDisabled) return false;
  browserCookiesDisabled = true;
  console.warn(
    `[yt-dlp] Bỏ --cookies-from-browser cho tiến trình này (${reason}). ` +
      'Đóng Chrome hoặc export cookies ra file và set YOUTUBE_COOKIES_FILE để dùng cookie.',
  );
  return true;
}

function getYoutubeDlAuthOptions(): YoutubeDlAuthOptions {
  const cookiesFile = env.youtubeCookiesFile.trim();
  if (cookiesFile) {
    return { cookies: cookiesFile };
  }

  const cookiesFromBrowser = env.youtubeCookiesFromBrowser.trim();
  if (cookiesFromBrowser && !browserCookiesDisabled) {
    return { cookiesFromBrowser };
  }

  return {};
}

export function getYoutubeDlCommonOptions(): YoutubeDlCommonOptions {
  return {
    ...getYoutubeDlAuthOptions(),
    noCheckCertificates: true,
    noWarnings: true,
    addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
  };
}

/** Public channel pages — no cookies; avoids Chrome cookie DB lock errors. */
export function getYoutubeDlPublicOptions(): YoutubeDlPublicOptions {
  return {
    dumpSingleJson: true,
    flatPlaylist: true,
    skipDownload: true,
    noCheckCertificates: true,
    noWarnings: true,
    ignoreErrors: true,
    addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
  };
}
