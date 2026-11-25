/**
 * Reads a channel's own analytics in YouTube Studio through an already signed-in page. Strictly read-only:
 * it opens pages, clicks the report tabs of a video's analytics page, and copies the visible text and a
 * screenshot. It never types, never signs in and never touches any other control.
 *
 * Checked against the real Studio on 2026-11-22 ("Video insights"): each report has its own address,
 * /video/<id>/analytics/hub_<report>, and every number is text inside <main>. Labels follow the account language,
 * so nothing here depends on them. The older layout (report tabs found by role) is kept as a fallback.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';

export interface StudioOrigins {
  youtube: string;
  studio: string;
}

export const LIVE_ORIGINS: StudioOrigins = { youtube: 'https://www.youtube.com', studio: 'https://studio.youtube.com' };

export class StudioAccessError extends Error {}

export interface PublishedVideo {
  videoId: string;
  title: string;
  /** Everything the channel page shows for the video (views, age…), in the page language. */
  text: string;
}

export interface VideoTabDump {
  index: number;
  label: string;
  textFile: string;
  imageFile: string;
  chars: number;
}

const NAVIGATION_TIMEOUT_MS = 45_000;
const TAB_TIMEOUT_MS = 30_000;

const pause = (page: Page, minMs: number, maxMs = minMs) => page.waitForTimeout(minMs + Math.round(Math.random() * (maxMs - minMs)));

/** Sign-in, identity check or "unusual traffic" pages: the user has to deal with those. */
export function accessProblem(url: string): string | null {
  let host = '';
  let pathname = '';
  try {
    ({ host, pathname } = new URL(url));
  } catch {
    return null;
  }
  if (/(^|\.)accounts\.google\./.test(host)) return `profile chưa đăng nhập Google hoặc Google đòi xác minh (${host})`;
  if (host.startsWith('consent.')) return `Google hiện trang xin đồng ý (${host})`;
  if (pathname.startsWith('/sorry')) return 'Google chặn truy cập bất thường (captcha)';
  return null;
}

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
  await pause(page, 1500, 2500);
  const problem = accessProblem(page.url());
  if (problem) throw new StudioAccessError(problem);
  // Wheel events go to whatever is under the mouse: keep it over the report, not the side menu.
  const size = page.viewportSize() ?? (await page.evaluate('({ width: innerWidth, height: innerHeight })')) as { width: number; height: number };
  await page.mouse.move(Math.round(size.width * 0.6), Math.round(size.height * 0.6));
}

/** tsx compiles named inner functions with a __name helper that does not exist inside the page. */
const defineNameHelper = (page: Page) => page.evaluate('globalThis.__name ??= fn => fn');

/** Visible text including open shadow roots, one rendered block per line; `main` leaves out menus and extensions. */
async function visibleText(page: Page, area: 'page' | 'main' = 'page'): Promise<string> {
  await defineNameHelper(page);
  return page.evaluate(area => {
    const lines: string[] = [];
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.replace(/\s+/g, ' ').trim();
        if (text && node.parentElement && visible(node.parentElement)) lines.push(text);
        return;
      }
      if (node instanceof Element) {
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(node.tagName)) return;
        if (getComputedStyle(node).display === 'none') return;
        const label = node.getAttribute('aria-label');
        // Charts and icon-only figures carry their numbers in aria-label.
        if (label && /\d/.test(label) && label.length < 400) lines.push(`[${label.replace(/\s+/g, ' ').trim()}]`);
        if (node instanceof HTMLSlotElement) {
          const assigned = node.assignedNodes();
          (assigned.length ? assigned : [...node.childNodes]).forEach(walk);
          return;
        }
        if (node.shadowRoot) {
          node.shadowRoot.childNodes.forEach(walk);
          return;
        }
      }
      node.childNodes.forEach(walk);
    };
    const root = area === 'main' ? document.querySelector('main') : document.body;
    if (root) walk(root);
    return lines.filter((line, index) => line !== lines[index - 1]).join('\n');
  }, area);
}

/** Waits until the visible text stops changing (reports load piece by piece). */
async function settle(page: Page, timeoutMs = 20_000, area: 'page' | 'main' = 'page', minChars = 1): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  let stable = 0;
  while (Date.now() < deadline) {
    const text = await visibleText(page, area);
    stable = text === last && text.length >= minChars ? stable + 1 : 0;
    last = text;
    if (stable >= 2) break;
    await page.waitForTimeout(1200);
  }
  return last;
}

/** The channel Studio opens for this account; `wanted` switches to another channel the account manages. */
export async function openStudioChannel(page: Page, origins: StudioOrigins, wanted?: string): Promise<string> {
  await open(page, origins.youtube);
  await open(page, wanted ? `${origins.studio}/channel/${wanted}` : origins.studio);
  const channelOf = () => /\/channel\/(UC[\w-]{22})/.exec(page.url())?.[1];
  const deadline = Date.now() + 20_000;
  while (!channelOf() && Date.now() < deadline) {
    const problem = accessProblem(page.url());
    if (problem) throw new StudioAccessError(problem);
    await page.waitForTimeout(500);
  }
  const channelId = channelOf();
  if (!channelId) throw new StudioAccessError('Studio không mở được kênh nào (tài khoản chưa có kênh, hoặc trang chưa tải)');
  if (wanted && channelId !== wanted) {
    throw new StudioAccessError(`Studio mở kênh ${channelId}, khác kênh trong app ${wanted}: profile này không quản lý kênh đó`);
  }
  return channelId;
}

/** The uploaded title; channel pages show machine translations in other interface languages. */
async function originalTitle(origins: StudioOrigins, videoId: string): Promise<string | null> {
  try {
    const target = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
    const response = await fetch(`${origins.youtube}/oembed?format=json&url=${target}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const { title } = (await response.json()) as { title?: string };
    return title?.trim() || null;
  } catch {
    return null;
  }
}

/** Wording of YouTube's "channel removed" page in the interface languages our profiles use. */
const CHANNEL_REMOVED = /terminated|has been removed|does ?n[o']t exist|isn't available|チャンネルは存在しません|アカウント.{0,20}(停止|解約|削除)|chấm dứt|không tồn tại|không có sẵn|해지/i;

/** Published videos, newest first, as listed on the public channel page. */
export async function listPublishedVideos(page: Page, origins: StudioOrigins, channelId: string, limit: number, shorts = false): Promise<PublishedVideo[]> {
  await open(page, `${origins.youtube}/channel/${channelId}/${shorts ? 'shorts' : 'videos'}`);
  await settle(page, 15_000);
  const collect = async () => {
    await defineNameHelper(page);
    return page.evaluate(() => {
      const found = new Map<string, { title: string; text: string }>();
      const anchors: HTMLAnchorElement[] = [];
      const walk = (root: Document | ShadowRoot | Element) => {
        root.querySelectorAll('*').forEach(element => {
          if (element instanceof HTMLAnchorElement) anchors.push(element);
          if (element.shadowRoot) walk(element.shadowRoot);
        });
      };
      walk(document);
      for (const anchor of anchors) {
        const id = /(?:[?&]v=|\/shorts\/)([\w-]{11})(?:[&#?/]|$)/.exec(anchor.href)?.[1];
        if (!id) continue;
        const card = anchor.closest('ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, ytm-shorts-lockup-view-model, yt-lockup-view-model, li, article');
        // Links outside the video grid (playlists in the header, a featured player) are not uploads.
        if (!card) continue;
        const known = found.get(id) ?? { title: '', text: '' };
        const title = (anchor.getAttribute('title') || anchor.textContent || '').replace(/\s+/g, ' ').trim();
        // The thumbnail link only says "12:34"; the title link is the longest text.
        if (title.length > known.title.length && !/^[\d:.\s]+$/.test(title)) known.title = title;
        known.text = (card.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
        found.set(id, known);
      }
      return [...found].map(([videoId, value]) => ({ videoId, ...value }));
    });
  };
  let videos = await collect();
  for (let attempt = 0; videos.length < limit && attempt < 8; attempt += 1) {
    const before = videos.length;
    await page.mouse.wheel(0, 2400);
    await pause(page, 1200, 1800);
    videos = await collect();
    if (videos.length === before && attempt >= 2) break;
  }
  if (!videos.length) {
    const shown = (await visibleText(page)).replace(/\s+/g, ' ');
    if (CHANNEL_REMOVED.test(shown)) throw new StudioAccessError(`YouTube báo kênh ${channelId} không còn (bị chấm dứt hoặc đã xoá): «${shown.slice(-160)}»`);
    return [];
  }
  const picked = videos.slice(0, limit);
  for (const video of picked) video.title = (await originalTitle(origins, video.videoId)) ?? video.title;
  return picked;
}

/** Reports of the current Studio, in reading order. Revenue is left out: the analysis does not need it. */
const REPORTS = ['overview', 'reach', 'engagement', 'audience'] as const;
/** A report that loaded shows at least this much text, even for a video without views. */
const MIN_REPORT_CHARS = 120;

/** The selected period ("Since published"): numbers of different periods cannot be compared. */
async function selectedPeriod(page: Page): Promise<string> {
  const selected = page.locator('main [role="tab"][aria-selected="true"]').first();
  return (await selected.innerText({ timeout: 2000 }).catch(() => '')).replace(/\s+/g, ' ').trim();
}

/** Copies the reports of one video (text + picture) into `dir`. */
export async function dumpVideoAnalytics(page: Page, origins: StudioOrigins, videoId: string, dir: string): Promise<VideoTabDump[]> {
  fs.mkdirSync(dir, { recursive: true });
  const dumps: VideoTabDump[] = [];
  for (const report of REPORTS) {
    const url = `${origins.studio}/video/${videoId}/analytics/hub_${report}`;
    await open(page, url);
    const ready = await page.locator('main').first().waitFor({ state: 'visible', timeout: TAB_TIMEOUT_MS }).then(() => true, () => false);
    const problem = accessProblem(page.url());
    if (problem) throw new StudioAccessError(problem);
    const text = ready ? await settle(page, 25_000, 'main', MIN_REPORT_CHARS) : '';
    if (!ready || text.length < MIN_REPORT_CHARS || !page.url().includes(`/${videoId}/analytics/hub_${report}`)) {
      // First report missing: this account still has the older Studio. A later one missing is just skipped.
      if (report === 'overview') return dumpTabbedAnalytics(page, origins, videoId, dir);
      continue;
    }
    const index = dumps.length + 1;
    const textFile = path.join(dir, `${index}.txt`);
    const imageFile = path.join(dir, `${index}.png`);
    fs.writeFileSync(textFile, `# ${report}\n# ${page.url()}\n# khoảng thời gian: ${await selectedPeriod(page)}\n${text}\n`, 'utf8');
    await page.locator('main').first().screenshot({ path: imageFile, timeout: 15_000 }).catch(() => page.screenshot({ path: imageFile }));
    dumps.push({ index, label: report, textFile, imageFile, chars: text.length });
    await pause(page, 600, 1200);
  }
  return dumps;
}

/** Older Studio: reports are tabs of one page. */
async function dumpTabbedAnalytics(page: Page, origins: StudioOrigins, videoId: string, dir: string): Promise<VideoTabDump[]> {
  await open(page, `${origins.studio}/video/${videoId}/analytics`);
  const tabs = page.locator('[role="tab"]');
  try {
    await tabs.first().waitFor({ state: 'visible', timeout: TAB_TIMEOUT_MS });
  } catch {
    const problem = accessProblem(page.url());
    throw new StudioAccessError(problem ?? `không thấy tab phân tích của video ${videoId} (Studio đổi giao diện hoặc video không thuộc kênh)`);
  }
  if (!page.url().includes(videoId)) throw new StudioAccessError(`Studio chuyển sang trang khác khi mở phân tích của ${videoId}`);
  fs.mkdirSync(dir, { recursive: true });

  const dumps: VideoTabDump[] = [];
  const labels = new Set<string>();
  const count = await tabs.count();
  for (let i = 0; i < count; i += 1) {
    const tab = tabs.nth(i);
    if (!(await tab.isVisible().catch(() => false))) continue;
    const label = ((await tab.innerText().catch(() => '')) || (await tab.getAttribute('aria-label')) || '').replace(/\s+/g, ' ').trim();
    // Metric cards are tabs too ("Views 1.2K"): they switch a chart, not the report.
    if (!label || /\d/.test(label) || labels.has(label)) continue;
    labels.add(label);
    await tab.click();
    await pause(page, 1200, 2200);
    let text = await settle(page);
    // Lower cards only render when scrolled to.
    for (let step = 0; step < 4; step += 1) {
      await page.mouse.wheel(0, 900);
      await pause(page, 500, 800);
    }
    const scrolled = await settle(page, 8_000);
    if (scrolled.length > text.length) text = scrolled;
    const index = dumps.length + 1;
    const textFile = path.join(dir, `${index}.txt`);
    const imageFile = path.join(dir, `${index}.png`);
    fs.writeFileSync(textFile, `# ${label}\n# ${page.url()}\n${text}\n`, 'utf8');
    await page.screenshot({ path: imageFile, fullPage: true }).catch(() => page.screenshot({ path: imageFile }));
    dumps.push({ index, label, textFile, imageFile, chars: text.length });
    await page.mouse.wheel(0, -9000);
    await pause(page, 400, 700);
  }
  if (!dumps.length) throw new StudioAccessError(`trang phân tích của ${videoId} không có tab báo cáo nào đọc được`);
  return dumps;
}
