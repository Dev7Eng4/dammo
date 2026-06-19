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
