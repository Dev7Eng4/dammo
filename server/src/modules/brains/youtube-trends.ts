import { Innertube, YTNodes } from 'youtubei.js';
type SearchFilters = NonNullable<Parameters<Innertube['search']>[1]>;

/** Search session located in Japan with Japanese UI, so titles come back untranslated. */
let sessionPromise: Promise<Innertube> | null = null;

function getSession(): Promise<Innertube> {
  if (!sessionPromise) {
    sessionPromise = Innertube.create({ lang: 'ja', location: 'JP' }).catch(err => {
      sessionPromise = null;
      throw err;
    });
  }
  return sessionPromise;
}

export interface TrendVideo {
  videoId: string;
  title: string;
  channel: string;
  channelId?: string;
  views: number;
  published: string;
  hoursAgo: number | null;
  /** Views per hour since upload: the main "is it blowing up" signal. */
  viewsPerHour: number | null;
  durationSeconds: number | null;
  url: string;
}

const UNIT_HOURS: Record<string, number> = {
  s: 1 / 3600, second: 1 / 3600, 秒: 1 / 3600,
  m: 1 / 60, min: 1 / 60, minute: 1 / 60, 分: 1 / 60,
  h: 1, hour: 1, 時間: 1,
  d: 24, day: 24, 日: 24,
  w: 24 * 7, week: 24 * 7, 週間: 24 * 7,
  mo: 24 * 30, month: 24 * 30, か月: 24 * 30, ヶ月: 24 * 30, カ月: 24 * 30,
  y: 24 * 365, year: 24 * 365, 年: 24 * 365,
};

/** "3 日前", "7d ago", "2 weeks ago", "Streamed 5 hours ago" → hours. */
export function parseHoursAgo(text: string | undefined): number | null {
  const ja = /(\d+)\s*(秒|分|時間|日|週間|か月|ヶ月|カ月|年)前/.exec(text ?? '');
  const en = /(\d+)\s*(mo|min|second|minute|hour|day|week|month|year|s|m|h|d|w|y)s?\s*ago/i.exec(text ?? '');
  const match = ja ?? en;
  if (!match) return null;
  const hours = UNIT_HOURS[match[2].toLowerCase()] ?? UNIT_HOURS[match[2]];
  return hours === undefined ? null : Number(match[1]) * hours;
}

/** "4,979 回視聴", "1.2万 回視聴", "12K views" → number. */
export function parseViews(text: string | undefined): number {
  if (!text || /no views|視聴なし/i.test(text)) return 0;
  const compact = /([\d.,]+)\s*(万|億|K|M|B)/i.exec(text);
  if (compact) {
    const factors: Record<string, number> = { 万: 1e4, 億: 1e8, K: 1e3, M: 1e6, B: 1e9 };
    return Math.round(Number(compact[1].replace(/,/g, '')) * factors[compact[2].toUpperCase()]);
  }
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function parseLength(text: string | undefined): number | null {
  if (!text) return null;
  const parts = text.split(':').map(Number);
  if (parts.some(n => Number.isNaN(n))) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function toTrendVideo(base: { videoId: string; title: string; channel: string; channelId?: string; viewText?: string; publishedText?: string; lengthText?: string }): TrendVideo {
  const views = parseViews(base.viewText);
  const hoursAgo = parseHoursAgo(base.publishedText);
  return {
    videoId: base.videoId,
    title: base.title,
    channel: base.channel,
    channelId: base.channelId,
    views,
    published: base.publishedText ?? '',
    hoursAgo,
    viewsPerHour: hoursAgo ? Math.round(views / Math.max(hoursAgo, 1)) : null,
    durationSeconds: parseLength(base.lengthText),
    url: `https://www.youtube.com/watch?v=${base.videoId}`,
  };
}

function fromVideoNode(node: YTNodes.Video): TrendVideo {
  return toTrendVideo({
    videoId: node.video_id,
    title: node.title.toString(),
    channel: node.author?.name ?? '',
    channelId: node.author?.id,
    viewText: node.view_count?.toString(),
    publishedText: node.published?.toString(),
    lengthText: node.length_text?.toString(),
  });
}

/** First UC… channel id anywhere inside a node (LockupView keeps it in the avatar's tap command). */
function findChannelId(node: unknown, depth = 0): string | undefined {
  if (!node || typeof node !== 'object' || depth > 16) return undefined;
  for (const value of Object.values(node)) {
    if (typeof value === 'string' && /^UC[\w-]{22}$/.test(value)) return value;
    if (typeof value === 'object') {
      const found = findChannelId(value, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

/** LockupView search result → TrendVideo. Its texts come doubled: [channel, channel, ("、他 3 チャンネル")x2, views x2, age x2, snippet…]. */
export function fromLockupNode(node: unknown): TrendVideo | null {
  const item = node as { content_id?: string; content_type?: string; metadata?: { title?: { text?: string }; metadata?: unknown }; content_image?: unknown };
  if (!item.content_id || (item.content_type && item.content_type !== 'VIDEO')) return null;
  const texts = [...new Set(collectTexts(item.metadata?.metadata))];
  const channelParts = [texts[0] ?? '', ...(texts[1]?.startsWith('、') ? [texts[1]] : [])];
  const collab = channelParts.length > 1;
  return toTrendVideo({
    videoId: item.content_id,
    title: item.metadata?.title?.text ?? '',
    channel: channelParts.join(''),
    // A collab lists several channels; like the Video layout, leave the id empty then.
    channelId: collab ? undefined : findChannelId(item.metadata),
    viewText: texts.find(t => /回視聴|views/i.test(t)) ?? texts.find(t => /^[\d.,]+\s*(万|億|K|M)?\s*回?$/.test(t.trim())),
    publishedText: texts.find(t => /前|ago/.test(t)),
    lengthText: collectTexts(item.content_image).find(t => /^\d+(:\d+)+$/.test(t)),
  });
}

export async function searchYoutube(
  query: string,
  options: { uploadDate?: SearchFilters['upload_date']; prioritize?: SearchFilters['prioritize']; limit?: number } = {},
): Promise<TrendVideo[]> {
  const yt = await getSession();
  const result = await yt.search(query, {
    type: 'video',
    upload_date: options.uploadDate ?? 'week',
    prioritize: options.prioritize ?? 'popularity',
  });
  const limit = Math.min(Math.max(options.limit ?? 15, 1), 30);
  const videos: TrendVideo[] = [];
  for (const node of result.results) {
    // YouTube A/B-tests a newer layout: the same results sometimes arrive as LockupView instead of Video.
    const video = node.is(YTNodes.Video) ? fromVideoNode(node) : node.type === 'LockupView' ? fromLockupNode(node) : null;
    if (!video) continue;
    videos.push(video);
    if (videos.length >= limit) break;
  }
  return videos;
}

/** YouTube autocomplete: what people are typing right now around a seed keyword. */
export async function youtubeSuggestions(query: string): Promise<string[]> {
  // youtubei.js' getSearchSuggestions decodes Japanese as mojibake (the endpoint answers in Shift_JIS),
  // so ask the same YouTube suggest source for UTF-8 JSON directly.
  const url = new URL('https://suggestqueries.google.com/complete/search');
  for (const [key, value] of Object.entries({ client: 'firefox', ds: 'yt', hl: 'ja', gl: 'jp', ie: 'utf-8', oe: 'utf-8', q: query })) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`YouTube suggest HTTP ${response.status}`);
  const data = (await response.json()) as [string, string[]];
  return (data[1] ?? []).slice(0, 15);
}

export interface TrendComment {
  text: string;
  likes: number;
  replies: number;
}

/** Top comments of one video (first page, ~20): what viewers feel, ask and complain about. */
export async function fetchTopComments(videoId: string, limit = 40): Promise<TrendComment[]> {
  const yt = await getSession();
  let page = await yt.getComments(videoId, 'TOP_COMMENTS');
  const comments: TrendComment[] = [];
  for (let round = 0; round < 3; round += 1) {
    for (const thread of page.contents) {
      const view = thread.comment;
      const text = view?.content?.toString().trim();
      if (!text) continue;
      comments.push({ text: text.slice(0, 500), likes: parseViews(view?.like_count), replies: parseViews(view?.reply_count) });
    }
    if (comments.length >= limit || !page.has_continuation) break;
    page = await page.getContinuation();
  }
  return comments.slice(0, limit);
}

export interface ChannelSnapshot {
  channelId: string;
  name: string;
  subscribers: string;
  videos: TrendVideo[];
}

/** Every `text` string inside a parsed node, in order (LockupView keeps views/dates in nested rows). */
function collectTexts(node: unknown, out: string[] = [], depth = 0): string[] {
  if (!node || typeof node !== 'object' || depth > 8) return out;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'text' && typeof value === 'string') out.push(value);
    else if (typeof value === 'object') collectTexts(value, out, depth + 1);
  }
  return out;
}

/** Latest uploads of a channel with views/hour, so outliers stand out against the channel's own baseline. */
export async function fetchChannelSnapshot(channelId: string, limit = 20): Promise<ChannelSnapshot> {
  const yt = await getSession();
  const channel = await yt.getChannel(channelId);
  const tab = await channel.getVideos();
  const name = channel.metadata.title ?? channelId;
  const videos: TrendVideo[] = [];
  for (const node of tab.videos as unknown[]) {
    const item = node as {
      type?: string;
      content_id?: string;
      video_id?: string;
      metadata?: { title?: { text?: string }; metadata?: unknown };
      title?: { toString(): string };
      view_count?: { toString(): string };
      published?: { toString(): string };
      length_text?: { toString(): string };
    };
    const videoId = item.content_id ?? item.video_id;
    if (!videoId) continue;
    const title = item.metadata?.title?.text ?? item.title?.toString() ?? '';
    const texts = item.type === 'LockupView' ? collectTexts(item.metadata?.metadata) : [];
    const viewText = item.view_count?.toString() ?? (texts.find(t => /回視聴|views/i.test(t)) ?? texts.find(t => /^[\d.,]+\s*(万|億|K|M)?\s*回?$/.test(t.trim())));
    const publishedText = item.published?.toString() ?? texts.find(t => /前|ago/.test(t)) ?? '';
    const lengthText = item.length_text?.toString() ?? collectTexts((node as { content_image?: unknown }).content_image).find(t => /^\d+(:\d+)+$/.test(t));
    const views = parseViews(viewText);
    const hoursAgo = parseHoursAgo(publishedText);
    videos.push({
      videoId,
      title,
      channel: name,
      channelId,
      views,
      published: publishedText,
      hoursAgo,
      viewsPerHour: hoursAgo ? Math.round(views / Math.max(hoursAgo, 1)) : null,
      durationSeconds: parseLength(lengthText),
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
    if (videos.length >= limit) break;
  }
  const headerTexts = collectTexts(channel.header);
  return {
    channelId,
    name,
    subscribers: headerTexts.find(t => /登録者|subscriber/i.test(t)) ?? '',
    videos,
  };
}
