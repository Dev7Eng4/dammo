import { AppError } from '../http/errors.js';

export type SourcePlatform = 'youtube' | 'tiktok' | 'facebook';

export interface NormalizedSourceUrl {
  platform: SourcePlatform;
  url: string;
  fullUrl: string;
}

function decodeUrlSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function stripQueryAndHash(value: string): string {
  return value.split(/[?#]/)[0] ?? value;
}

function normalizeYoutubePath(path: string): { url: string; fullUrl: string } {
  const cleaned = stripQueryAndHash(path);
  const decoded = decodeUrlSegment(cleaned);

  if (decoded.startsWith('channel/') || decoded.startsWith('c/')) {
    return {
      url: decoded,
      fullUrl: `https://youtube.com/${decoded}`,
    };
  }

  const handle = decoded.startsWith('@') ? decoded : `@${decoded.replace(/^@/, '')}`;
  return {
    url: handle,
    fullUrl: `https://youtube.com/${handle}`,
  };
}

/**
 * Reduces any Facebook page URL to its profile path: `/psychlume/reels/?x=1` -> `/psychlume`,
 * `/profile.php?id=123/reels` -> `/profile.php?id=123`, `/pages/Name/123/videos` -> `/pages/Name/123`.
 */
export function normalizeFacebookPath(raw: string): string {
  const withoutHash = raw.trim().split('#')[0] ?? '';
  const withoutHost = withoutHash
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.|m\.|web\.|mbasic\.)?(facebook|fb)\.com/i, '');
  const [pathPart = '', query = ''] = withoutHost.split('?');
  const segments = pathPart.split('/').filter(Boolean).map(decodeUrlSegment);

  if (segments[0]?.toLowerCase() === 'profile.php') {
    const id = /^\d+/.exec(new URLSearchParams(query).get('id') ?? '')?.[0];
    return id ? `/profile.php?id=${id}` : '/profile.php';
  }
  if (segments[0]?.toLowerCase() === 'pages' && segments.length >= 3) {
    return `/${segments.slice(0, 3).join('/')}`;
  }
  return `/${segments[0] ?? ''}`;
}

export function canonicalizeSourceUrl(url: string): string {
  const trimmedWithQuery = url.trim();
  const trimmed = stripQueryAndHash(trimmedWithQuery);
  const lower = trimmed.toLowerCase();
  const withoutProtocol = lower.replace(/^https?:\/\//, '');
  const withoutWww = withoutProtocol.replace(/^www\./, '');

  if (withoutWww.startsWith('@')) {
    return `https://youtube.com/${decodeUrlSegment(withoutWww)}`;
  }

  if (withoutWww.startsWith('youtube.com/') || withoutWww.startsWith('youtu.be/')) {
    const path = withoutWww
      .replace(/^youtube\.com\//, '')
      .replace(/^youtu\.be\//, '')
      .replace(/\/$/, '');
    const { fullUrl } = normalizeYoutubePath(path);
    return fullUrl.toLowerCase();
  }

  if (withoutWww.startsWith('tiktok.com/')) {
    const path = decodeUrlSegment(withoutWww.replace(/^tiktok\.com\//, '').replace(/\/$/, ''));
    const handle = path.startsWith('@') ? path : `@${path.replace(/^@/, '')}`;
    return `https://tiktok.com/${handle}`.toLowerCase();
  }

  if (withoutWww.startsWith('facebook.com/') || withoutWww.startsWith('fb.com/')) {
    return `https://facebook.com${normalizeFacebookPath(trimmedWithQuery)}`.toLowerCase();
  }

  if (lower.startsWith('@')) {
    return `https://youtube.com/${decodeUrlSegment(lower)}`;
  }

  return decodeUrlSegment(lower).replace(/\/$/, '');
}

export function detectPlatform(raw: string): SourcePlatform {
  const value = raw.trim().toLowerCase();

  if (value.startsWith('@')) return 'youtube';

  if (
    value.includes('youtube.com') ||
    value.includes('youtu.be') ||
    value.includes('youtube.com')
  ) {
    return 'youtube';
  }

  if (value.includes('tiktok.com')) return 'tiktok';

  if (value.includes('facebook.com') || value.includes('fb.com') || value.includes('fb.watch')) {
    return 'facebook';
  }

  if (value.startsWith('/') && !value.includes('.')) {
    return 'facebook';
  }

  throw new AppError('Unsupported platform URL', 400, 'UNSUPPORTED_PLATFORM');
}

export function normalizeSourceUrl(raw: string, platform?: SourcePlatform): NormalizedSourceUrl {
  const detected = platform ?? detectPlatform(raw);
  let value = stripQueryAndHash(raw.trim());
  value = value.replace(/^https?:\/\//i, '');

  if (detected === 'youtube') {
    if (value.startsWith('@')) {
      const { url, fullUrl } = normalizeYoutubePath(value);
      return { platform: 'youtube', url, fullUrl };
    }

    value = value.replace(/^(www\.)?youtube\.com\/?/i, '');
    value = value.replace(/^(www\.)?youtu\.be\/?/i, '');

    if (!value.startsWith('@') && !value.startsWith('channel/') && !value.startsWith('c/')) {
      value = `@${value.replace(/^@/, '')}`;
    }

    const { url, fullUrl } = normalizeYoutubePath(value);
    return { platform: 'youtube', url, fullUrl };
  }

  if (detected === 'tiktok') {
    value = value.replace(/^(www\.)?tiktok\.com\/?/i, '');
    value = decodeUrlSegment(value);
    if (!value.startsWith('@')) {
      value = `@${value.replace(/^@/, '')}`;
    }
    return {
      platform: 'tiktok',
      url: value,
      fullUrl: `https://tiktok.com/${value}`,
    };
  }

  const facebookPath = normalizeFacebookPath(raw);
  return {
    platform: 'facebook',
    url: facebookPath,
    fullUrl: `https://facebook.com${facebookPath}`,
  };
}

export function parseSourceUrl(raw: string): NormalizedSourceUrl {
  const platform = detectPlatform(raw);
  return normalizeSourceUrl(raw, platform);
}

export function buildMinimalName(url: string, platform: SourcePlatform): string {
  if (platform === 'youtube' || platform === 'tiktok') {
    const handle = url.startsWith('@') ? url : `@${url}`;
    return handle.replace('@', '').replace(/[_-]/g, ' ') || 'Unknown Source';
  }
  const slug = url.replace(/^\//, '').split('/')[0] ?? 'unknown';
  return slug.replace(/[-_]/g, ' ') || 'Unknown Source';
}
