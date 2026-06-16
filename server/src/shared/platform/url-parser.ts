import { AppError } from '../http/errors.js';

export type SourcePlatform = 'youtube' | 'tiktok' | 'facebook';

export interface NormalizedSourceUrl {
  platform: SourcePlatform;
  url: string;
  fullUrl: string;
}

function ensureProtocol(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('@')) return `https://youtube.com/${trimmed}`;
  if (trimmed.startsWith('/')) return trimmed;
  return trimmed;
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
  let value = raw.trim();
  value = value.replace(/^https?:\/\//i, '');

  if (detected === 'youtube') {
    if (value.startsWith('@')) {
      const handle = value;
      return {
        platform: 'youtube',
        url: handle,
        fullUrl: `https://youtube.com/${handle}`,
      };
    }

    value = value.replace(/^(www\.)?youtube\.com\/?/i, '');
    value = value.replace(/^(www\.)?youtu\.be\/?/i, '');

    if (!value.startsWith('@') && !value.startsWith('channel/') && !value.startsWith('c/')) {
      value = `@${value.replace(/^@/, '')}`;
    }

    const path = value.startsWith('@') ? value : value;
    return {
      platform: 'youtube',
      url: path.startsWith('@') ? path : `@${path}`,
      fullUrl: `https://youtube.com/${path.startsWith('@') ? path : path}`,
    };
  }

  if (detected === 'tiktok') {
    value = value.replace(/^(www\.)?tiktok\.com\/?/i, '');
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
