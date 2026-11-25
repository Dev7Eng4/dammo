/**
 * Comments of one of our own channels: reading them (public data, no sign-in) and, on an approved plan only,
 * replying to or hearting one comment through a signed-in page. Checked against the real comment page on 2026-11-22:
 * /watch?v=<video>&lc=<comment> puts that comment first, with its reply and creator-heart buttons inside it.
 */
import { Innertube, Log } from 'youtubei.js';
import type { Locator, Page } from 'playwright';
import { parseHoursAgo } from '../../modules/brains/youtube-trends.js';
import { accessProblem, StudioAccessError, type StudioOrigins } from './studio-reader.js';

Log.setLevel(Log.Level.NONE);

export interface CommentReply {
  commentId: string;
  author: string;
  byCreator: boolean;
  text: string;
  published: string;
}

/** waiting: nobody from the channel answered · new_reply: the viewer wrote again after our answer · answered. */
export type CommentState = 'waiting' | 'new_reply' | 'answered';

export interface ChannelComment {
  videoId: string;
  videoTitle: string;
  commentId: string;
  author: string;
  byCreator: boolean;
  text: string;
  published: string;
  hoursAgo: number | null;
  likes: number;
  hearted: boolean;
  pinned: boolean;
  replies: CommentReply[];
  state: CommentState;
  /** Newest reply in the thread: a thread handled before comes back only when this changes. */
  lastReplyId: string | null;
}

let session: Promise<Innertube> | null = null;
const innertube = () => (session ??= Innertube.create({ lang: 'ja', location: 'JP' }));

const toCount = (value: unknown): number => {
  const match = /([\d.,]+)\s*(万|K|M)?/i.exec(String(value ?? ''));
  if (!match) return 0;
  const unit = { 万: 1e4, K: 1e3, M: 1e6 }[(match[2] ?? '').toUpperCase()] ?? 1;
  return Math.round(Number(match[1].replace(/,/g, '')) * unit) || 0;
};

/** A video's comment threads, newest first. Replies are only fetched for threads that have some. */
export async function fetchVideoComments(videoId: string, videoTitle: string, max = 60): Promise<ChannelComment[]> {
  const yt = await innertube();
  let page;
  try {
    page = await yt.getComments(videoId, 'NEWEST_FIRST');
  } catch (err) {
    // Comments turned off, or a video without any.
    if (/comment/i.test((err as Error).message)) return [];
    throw err;
  }
  const comments: ChannelComment[] = [];
  for (let round = 0; round < 5 && comments.length < max; round += 1) {
    for (const thread of page.contents as any[]) {
      const view = thread.comment;
      const text = view?.content?.toString().trim();
      if (!view?.comment_id || !text) continue;
      const replies: CommentReply[] = [];
      if (toCount(view.reply_count) > 0) {
        try {
          const loaded = await thread.getReplies();
          for (const entry of (loaded?.replies ?? []) as any[]) {
            const reply = entry.comment ?? entry;
            if (!reply?.comment_id) continue;
            replies.push({
              commentId: reply.comment_id,
              author: reply.author?.name ?? '',
              byCreator: Boolean(reply.author?.is_creator),
              text: reply.content?.toString().trim() ?? '',
              published: reply.published_time ?? '',
            });
          }
        } catch {
          // Replies unknown: without them the thread cannot be called unanswered.
          replies.push({ commentId: '', author: '', byCreator: true, text: '(không đọc được trả lời)', published: '' });
        }
      }
      const answered = replies.some(reply => reply.byCreator);
      const last = replies.at(-1);
      comments.push({
        videoId,
        videoTitle,
        commentId: view.comment_id,
        author: view.author?.name ?? '',
        byCreator: Boolean(view.author?.is_creator),
        text,
        published: view.published_time ?? '',
        hoursAgo: parseHoursAgo(view.published_time),
        likes: toCount(view.like_count),
        hearted: Boolean(view.is_hearted),
        pinned: Boolean(view.is_pinned),
        replies,
        state: !answered ? 'waiting' : last && !last.byCreator ? 'new_reply' : 'answered',
        lastReplyId: last?.commentId || null,
      });
    }
    if (!page.has_continuation) break;
    page = await page.getContinuation();
  }
  return comments.slice(0, max);
}

/** Letters and digits only: the page drops emoji and reflows spaces. */
export const commentKey = (text: string) => text.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '');

// ---------- signed-in page ----------
async function go(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(2500 + Math.round(Math.random() * 1500));
  const problem = accessProblem(page.url());
  if (problem) throw new StudioAccessError(problem);
}

export interface CommentNotification {
  text: string;
  videoId: string;
  commentId: string;
}

/** Opens the bell and reads the notifications that point at a comment. `null` when the bell could not be read. */
export async function readCommentNotifications(page: Page, origins: StudioOrigins): Promise<{ total: number; comments: CommentNotification[] } | null> {
  await go(page, origins.youtube);
  const bell = page.locator('ytd-notification-topbar-button-renderer button, ytd-notification-topbar-button-shape-renderer button').first();
  try {
    await bell.waitFor({ state: 'visible', timeout: 15_000 });
    await bell.click();
    await page.locator('ytd-notification-renderer').first().waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    return null;
  }
  await page.waitForTimeout(1500);
  const raw = await page.locator('ytd-notification-renderer').evaluateAll(nodes =>
    nodes.map(node => ({ text: (node.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300), hrefs: [...node.querySelectorAll('a[href]')].map(a => (a as HTMLAnchorElement).href) })),
  );
  await page.keyboard.press('Escape');
  const comments = new Map<string, CommentNotification>();
  for (const { text, hrefs } of raw) {
    for (const href of hrefs) {
      const url = new URL(href, origins.youtube);
      const commentId = url.searchParams.get('lc');
      const videoId = url.searchParams.get('v') ?? /\/shorts\/([\w-]{11})/.exec(url.pathname)?.[1];
      if (commentId && videoId) comments.set(commentId, { text, videoId, commentId: commentId.split('.')[0] });
    }
  }
  return { total: raw.length, comments: [...comments.values()] };
}

export class CommentActionError extends Error {}

/** Opens one comment and makes sure it is the one the plan was written for. */
export async function openComment(page: Page, origins: StudioOrigins, comment: Pick<ChannelComment, 'videoId' | 'commentId' | 'text'>): Promise<Locator> {
  await go(page, `${origins.youtube}/watch?v=${comment.videoId}&lc=${encodeURIComponent(comment.commentId)}`);
  await page.evaluate('document.querySelector("video")?.pause()').catch(() => undefined);
  const size = page.viewportSize() ?? ((await page.evaluate('({ width: innerWidth, height: innerHeight })')) as { width: number; height: number });
  await page.mouse.move(Math.round(size.width * 0.35), Math.round(size.height * 0.6));
  const box = page.locator('ytd-comment-view-model', { has: page.locator(`a[href*="lc=${comment.commentId}"]`) }).first();
  for (let step = 0; step < 14 && !(await box.count()); step += 1) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(900);
  }
  if (!(await box.count())) throw new CommentActionError('không thấy bình luận trên trang (đã bị xoá hoặc ẩn)');
  await box.scrollIntoViewIfNeeded();
  const shown = commentKey(await box.locator('#content-text').first().innerText());
  const wanted = commentKey(comment.text);
  if (!shown || shown.slice(0, 40) !== wanted.slice(0, 40)) throw new CommentActionError('nội dung bình luận trên trang khác lúc lập kế hoạch (người xem đã sửa)');
  return box;
}

/** Only the channel owner gets a heart button on a comment that has no heart yet. */
export async function actsAsOwner(box: Locator): Promise<boolean> {
  return box.locator('#creator-heart-button').first().isVisible().catch(() => false);
}

export async function heartComment(page: Page, box: Locator): Promise<void> {
  const button = box.locator('#creator-heart-button').first();
  if (!(await button.isVisible().catch(() => false))) throw new CommentActionError('không có nút tim: trang không ở vai chủ kênh');
  await button.click();
  await page.waitForTimeout(2000);
}

/** The real button: the element with the id is a wrapper that can be wider than it. */
async function press(dialog: Locator, id: 'cancel-button' | 'submit-button'): Promise<void> {
  const inner = dialog.locator(`#${id} button`).first();
  await ((await inner.count()) ? inner : dialog.locator(`#${id}`).first()).click();
}

/** Writes the reply; with `submit` false it is typed, checked and cancelled. */
export async function replyToComment(page: Page, box: Locator, text: string, submit: boolean): Promise<void> {
  await box.locator('#reply-button-end button').first().click();
  const dialog = box.locator('#reply-dialog');
  const editor = dialog.locator('#contenteditable-root').first();
  await editor.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
    throw new CommentActionError('không mở được ô trả lời');
  });
  await editor.click();
  await page.keyboard.insertText(text);
  await page.waitForTimeout(700);
  const typed = commentKey(await editor.innerText());
  if (!typed.endsWith(commentKey(text))) {
    await press(dialog, 'cancel-button').catch(() => undefined);
    throw new CommentActionError('chữ trong ô trả lời không đúng, đã huỷ');
  }
  if (!submit) {
    await press(dialog, 'cancel-button');
    await editor.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
    return;
  }
  await press(dialog, 'submit-button');
  await editor.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {
    throw new CommentActionError('bấm gửi nhưng ô trả lời chưa đóng: kiểm tra bằng tay trước khi gửi lại');
  });
}

/** What the public page says now; YouTube can take a while to show a new reply. */
export async function confirmAction(comment: Pick<ChannelComment, 'videoId' | 'commentId' | 'videoTitle'>, reply?: string): Promise<{ replied: boolean; byCreator: boolean; hearted: boolean } | null> {
  const found = (await fetchVideoComments(comment.videoId, comment.videoTitle, 100)).find(c => c.commentId === comment.commentId);
  if (!found) return null;
  const mine = reply ? found.replies.find(r => commentKey(r.text).endsWith(commentKey(reply))) : undefined;
  return { replied: Boolean(mine), byCreator: Boolean(mine?.byCreator), hearted: found.hearted };
}
