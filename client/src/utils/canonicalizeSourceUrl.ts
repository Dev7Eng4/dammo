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

function normalizeYoutubePath(path: string): string {
  const cleaned = stripQueryAndHash(path);
  const decoded = decodeUrlSegment(cleaned);

  if (decoded.startsWith('channel/') || decoded.startsWith('c/')) {
    return `https://youtube.com/${decoded}`;
  }

  const handle = decoded.startsWith('@') ? decoded : `@${decoded.replace(/^@/, '')}`;
  return `https://youtube.com/${handle}`;
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
    return normalizeYoutubePath(path).toLowerCase();
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
