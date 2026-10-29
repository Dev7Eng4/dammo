import type { Page, Response } from 'playwright';
import { withFacebookBrowserPage } from './facebook-browser.js';
import type { YoutubeChannelVideo } from '../youtube/youtube-channel.types.js';

/**
 * Verified on https://www.facebook.com/psychlume/reels/ (logged out):
 * - DOM: each reel is `<a aria-label="Reel tile preview" href="/reel/<id>/?s=...">`, its text is the view count.
 * - Network: `/api/graphql/` responses (NDJSON, one JSON document per line) carry reel nodes under
 *   `...aggregated_fb_shorts.edges[].profile_reel_node.node` with the caption (`message.text`),
 *   `short_form_video_context.video.playable_duration_in_ms`, `creation_time` and `shareable_url`,
 *   plus `page_info.has_next_page`. The first page of reels ships in the initial
 *   `ProfileCometTopAppSectionQuery`; further pages arrive while scrolling.
 * - The login dialog (`div[role="dialog"]`) blocks scrolling/pagination until it is closed.
 */
const SELECTOR = {
  reelTile: 'a[href*="/reel/"]',
  loginDialogClose: ['div[role="dialog"] [aria-label="Close"]', 'div[role="dialog"] [aria-label="Đóng"]'],
} as const;

const GRAPHQL_URL_PART = '/api/graphql';
const REEL_HREF_RE = /\/reel\/(\d+)/;
const MAX_REELS_DEFAULT = 1000;
const IDLE_ROUNDS_BEFORE_STOP = 5;
const SCROLL_PAUSE_MS = 1500;
const NAV_TIMEOUT_MS = 45_000;
const FIRST_TILE_TIMEOUT_MS = 20_000;
const TITLE_MAX_LENGTH = 120;

export interface FacebookReelsResult {
  name: string;
  reels: YoutubeChannelVideo[];
  /** True when scraping ended because Facebook reported no further pages (the list is complete). */
  complete: boolean;
  /**
   * True when no logged-in profile was used. Facebook may then stop paginating early
   * (see `complete`), so an incomplete list is likely a login-wall limit, not the real end.
   */
  loggedOut: boolean;
}

export interface FetchFacebookReelsOptions {
  maxReels?: number;
  /** Called after each scroll round with the number of reels collected so far. */
  onProgress?: (count: number) => void;
}

/** "7.3M" / "102K" / "1,234" -> number. Returns undefined when the text is not a count. */
export function parseCompactCount(text: string): number | undefined {
  const match = /^([\d.,]+)\s*([KMB])?$/i.exec(text.trim());
  if (!match) return undefined;
  const base = Number(match[1].replace(/,/g, match[2] ? '.' : ''));
  if (!Number.isFinite(base)) return undefined;
  const multiplier = { K: 1e3, M: 1e6, B: 1e9 }[(match[2] ?? '').toUpperCase() as 'K' | 'M' | 'B'] ?? 1;
  return Math.round(base * multiplier);
}

function pageNameFromTitle(title: string, fallback: string): string {
  const name = title
    .replace(/\s*\|\s*Facebook\s*$/i, '')
    .replace(/\s+Reels\s*$/i, '')
    .trim();
  return name || fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function captionToTitle(caption: string | undefined, fallback: string): string {
  const firstLine = caption?.split('\n').find((line) => line.trim())?.trim();
  if (!firstLine) return fallback;
  return firstLine.length > TITLE_MAX_LENGTH ? `${firstLine.slice(0, TITLE_MAX_LENGTH - 1)}…` : firstLine;
}

/** Maps one `profile_reel_node.node` object, or null when it is not a usable reel. */
function mapReelNode(node: Record<string, unknown>, slug: string): YoutubeChannelVideo | null {
  const context = isRecord(node.short_form_video_context) ? node.short_form_video_context : undefined;
  const video = isRecord(context?.video) ? context.video : undefined;
  const id = typeof video?.id === 'string' ? video.id : undefined;
  if (!id) return null;

  const durationMs = typeof video?.playable_duration_in_ms === 'number' ? video.playable_duration_in_ms : undefined;
  const creationTime = typeof node.creation_time === 'number' ? node.creation_time : undefined;
  const message = isRecord(node.message) && typeof node.message.text === 'string' ? node.message.text : undefined;
  const shareable = typeof context?.shareable_url === 'string' ? context.shareable_url : undefined;

  return {
    id,
    title: captionToTitle(message, `${slug} reel ${id}`),
    url: shareable ?? `https://www.facebook.com/reel/${id}`,
    duration: durationMs !== undefined ? Math.round(durationMs / 1000) : undefined,
    publishedAt: creationTime ? new Date(creationTime * 1000).toISOString() : undefined,
  };
}

interface ParsedBatch {
  reels: YoutubeChannelVideo[];
  /** has_next_page of the reels connection, when this response carried one. */
  hasNextPage?: boolean;
}

/** Walks a GraphQL document collecting reel nodes and the reels connection's page_info. */
function extractReels(doc: unknown, slug: string, batch: ParsedBatch): void {
  if (Array.isArray(doc)) {
    for (const item of doc) extractReels(item, slug, batch);
    return;
  }
  if (!isRecord(doc)) return;

  if (Array.isArray(doc.edges) && doc.edges.some((edge) => isRecord(edge) && 'profile_reel_node' in edge)) {
    const pageInfo = isRecord(doc.page_info) ? doc.page_info : undefined;
    if (typeof pageInfo?.has_next_page === 'boolean') batch.hasNextPage = pageInfo.has_next_page;
  }

  const reelNode = isRecord(doc.profile_reel_node) && isRecord(doc.profile_reel_node.node) ? doc.profile_reel_node.node : null;
  if (reelNode) {
    const reel = mapReelNode(reelNode, slug);
    if (reel) batch.reels.push(reel);
    return;
  }

  for (const value of Object.values(doc)) extractReels(value, slug, batch);
}

function parseGraphqlBody(body: string, slug: string): ParsedBatch {
  const batch: ParsedBatch = { reels: [] };
  // Facebook streams several JSON documents separated by newlines.
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      extractReels(JSON.parse(trimmed), slug, batch);
    } catch {
      /* partial or non-JSON line */
    }
  }
  return batch;
}

async function dismissLoginDialog(page: Page): Promise<void> {
  for (const selector of SELECTOR.loginDialogClose) {
    const close = page.locator(selector).first();
    if (await close.isVisible().catch(() => false)) {
      await close.click().catch(() => undefined);
      await page.waitForTimeout(500);
      return;
    }
  }
}

async function readTileViewCounts(page: Page): Promise<Map<string, number>> {
  const tiles = await page.$$eval(SELECTOR.reelTile, (anchors) =>
    anchors.map((a) => ({ href: a.getAttribute('href') ?? '', text: (a as HTMLElement).innerText ?? '' })),
  );
  const counts = new Map<string, number>();
  for (const tile of tiles) {
    const id = REEL_HREF_RE.exec(tile.href)?.[1];
    const count = parseCompactCount(tile.text);
    if (id && count !== undefined) counts.set(id, count);
  }
  return counts;
}

/**
 * Opens the page's reels tab in an already-open Playwright page, scrolls until Facebook reports no
 * more pages (or nothing new loads for a few rounds), and returns every reel it saw.
 */
export async function scrapeReelsTab(
  page: Page,
  pageUrl: string,
  options: FetchFacebookReelsOptions = {},
): Promise<Omit<FacebookReelsResult, 'loggedOut'>> {
  const maxReels = options.maxReels ?? MAX_REELS_DEFAULT;
  const slug = pageUrl.replace(/^\//, '').split('?')[0] || 'facebook';
  const reelsUrl = pageUrl.startsWith('/profile.php')
    ? `https://www.facebook.com${pageUrl}&sk=reels_tab`
    : `https://www.facebook.com${pageUrl}/reels/`;

  const reels = new Map<string, YoutubeChannelVideo>();
  let hasNextPage: boolean | undefined;
  const pendingBodies: Promise<void>[] = [];

  const onResponse = (response: Response) => {
    if (!response.url().includes(GRAPHQL_URL_PART)) return;
    pendingBodies.push(
      response
        .text()
        .then((body) => {
          const batch = parseGraphqlBody(body, slug);
          for (const reel of batch.reels) if (!reels.has(reel.id)) reels.set(reel.id, reel);
          if (batch.hasNextPage !== undefined) hasNextPage = batch.hasNextPage;
        })
        .catch(() => undefined),
    );
  };
  page.on('response', onResponse);

  try {
    await page.goto(reelsUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    await page.waitForSelector(SELECTOR.reelTile, { timeout: FIRST_TILE_TIMEOUT_MS }).catch(() => undefined);
    await dismissLoginDialog(page);

    let idleRounds = 0;
    while (reels.size < maxReels && idleRounds < IDLE_ROUNDS_BEFORE_STOP) {
      const before = reels.size;
      await page.mouse.wheel(0, 4000);
      await page.keyboard.press('End').catch(() => undefined);
      await page.waitForTimeout(SCROLL_PAUSE_MS);
      await Promise.all(pendingBodies.splice(0));

      options.onProgress?.(reels.size);
      if (hasNextPage === false) break;
      idleRounds = reels.size === before ? idleRounds + 1 : 0;
    }
    await Promise.all(pendingBodies.splice(0));

    // View counts only exist on the rendered tiles; merge them in by reel id.
    for (const [id, viewCount] of await readTileViewCounts(page)) {
      const reel = reels.get(id);
      if (reel) reel.viewCount = viewCount;
    }

    const name = pageNameFromTitle(await page.title(), slug);
    return { name, reels: [...reels.values()].slice(0, maxReels), complete: hasNextPage === false };
  } finally {
    page.off('response', onResponse);
  }
}

/** Lists the reels of a Facebook page. `pageUrl` is the normalized profile path (e.g. `/psychlume`). */
export async function fetchFacebookReels(
  pageUrl: string,
  options: FetchFacebookReelsOptions = {},
): Promise<FacebookReelsResult> {
  const { value, loggedOut } = await withFacebookBrowserPage((page) => scrapeReelsTab(page, pageUrl, options));
  return { ...value, loggedOut };
}
