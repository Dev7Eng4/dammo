export function extractYoutubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const v = parsed.searchParams.get('v');
    if (v) return v;

    const host = parsed.hostname.replace(/^www\./i, '');
    if (host === 'youtu.be') {
      const id = parsed.pathname.replace(/^\//, '').split('/')[0];
      if (id) return id;
    }

    const shortsMatch = parsed.pathname.match(/\/shorts\/([^/]+)/);
    if (shortsMatch?.[1]) return shortsMatch[1];
    const embedMatch = parsed.pathname.match(/\/embed\/([^/]+)/);
    if (embedMatch?.[1]) return embedMatch[1];
    return null;
  } catch {
    return null;
  }
}

export function canonicalizeYoutubeVideoUrl(url: string): string {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube video URL');
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
}
