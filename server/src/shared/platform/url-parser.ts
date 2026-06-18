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

export function canonicalizeSourceUrl(url: string): string {
  const trimmed = stripQueryAndHash(url.trim());
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
    const path = decodeUrlSegment(
      withoutWww.replace(/^facebook\.com/, '').replace(/^fb\.com/, '').replace(/\/$/, ''),
    );
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `https://facebook.com${normalizedPath}`.toLowerCase();
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

  value = value.replace(/^(www\.)?facebook\.com\/?/i, '');
  value = value.replace(/^(www\.)?fb\.com\/?/i, '');
  value = decodeUrlSegment(value);
  if (!value.startsWith('/')) {
    value = `/${value.replace(/^\//, '')}`;
  }
  return {
    platform: 'facebook',
    url: value,
    fullUrl: `https://facebook.com${value}`,
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
