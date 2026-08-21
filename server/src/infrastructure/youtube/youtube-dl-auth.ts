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

function getYoutubeDlAuthOptions(): YoutubeDlAuthOptions {
  const cookiesFile = env.youtubeCookiesFile.trim();
  if (cookiesFile) {
    return { cookies: cookiesFile };
  }

  const cookiesFromBrowser = env.youtubeCookiesFromBrowser.trim();
  if (cookiesFromBrowser) {
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
