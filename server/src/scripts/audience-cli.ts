/**
 * CLI of the jp-psy-audience skill, channel-comments mode: new comments on one of our channels, and the replies and
 * hearts the user approved. Reading is free; `send` only touches items marked approved, after the user said yes in chat.
 *
 *   npm run -s audience -- pull <email> [--videos 12] [--days 60]        # notifications + comments, opens the GPM profile
 *   npm run -s audience -- scan <email | channel id> [--videos 12]       # comments only, no browser
 *   npm run -s audience -- check <run.json> plan.json                    # validates the drafted plan
 *   npm run -s audience -- send <email> <run.json> plan.json [--dry-run] # replies / hearts of approved items
 *   npm run -s audience -- history <email | channel id>
 * Instead of an email: --channel <app id> with --chrome-profile "<name>" or --cdp http://127.0.0.1:9222 (see studio).
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { paths } from '../config/paths.js';
import { readJson, writeJson } from '../infrastructure/storage/json-store.js';
import { fetchChannelSnapshot } from '../modules/brains/youtube-trends.js';
import { youtubeChannelsRepository } from '../modules/youtube-channels/youtube-channels.repository.js';
import type { YoutubeChannel } from '../modules/youtube-channels/youtube-channels.types.js';
import { channelByEmail, mask, normalizeEmail, openSession, resolve, resolveWithoutGpm, serverBusy } from './lib/channel-browser.js';
import {
  actsAsOwner,
  CommentActionError,
  commentKey,
  confirmAction,
  fetchVideoComments,
  heartComment,
  openComment,
  readCommentNotifications,
  replyToComment,
  type ChannelComment,
  type CommentNotification,
} from './lib/channel-comments.js';
import { LIVE_ORIGINS, openStudioChannel, StudioAccessError } from './lib/studio-reader.js';

const ROOT = path.join(paths.dataDir, 'audience-skill');
const REPO_ROOT = path.resolve(paths.dataDir, '../..');
const MAX_REPLIES = 20;
const MAX_HEARTS = 40;
const MAX_REPLY_CHARS = 300;
/** Share of bigrams two replies may have in common before they read as a template. */
const TEMPLATE_LIMIT = 0.7;

const rel = (file: string) => path.relative(REPO_ROOT, file).replaceAll('\\', '/');

function parseArgs(argv: string[]) {
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (['--dry-run', '--force', '--keep-open', '--all'].includes(arg)) flags[arg.slice(2)] = '1';
    else if (arg.startsWith('--')) flags[arg.slice(2)] = argv[(i += 1)] ?? '';
    else rest.push(arg);
  }
  return { flags, rest };
}

function safeJson<T>(file: string): T | null {
  try {
    return readJson<T>(file);
  } catch {
    return null;
  }
}

interface Handled {
  videoId: string;
  repliedAt?: string;
  reply?: string;
  heartedAt?: string;
  skippedAt?: string;
  reason?: string;
  lastReplyId: string | null;
}
type History = Record<string, Handled>;
const historyFile = (channelId: string) => path.join(ROOT, channelId, 'history.json');
const readHistory = (channelId: string): History => safeJson<History>(historyFile(channelId)) ?? {};

interface RunFile {
  channelId: string;
  channelName: string;
  youtubeChannelId: string;
  at: string;
  /** null: the bell was not read (no browser, or its layout changed). */
  notifications: { total: number; comments: CommentNotification[] } | null;
  videosRead: number;
  comments: ChannelComment[];
}

function findChannel(input: string | undefined): YoutubeChannel {
  const value = input ?? '';
  const channel = value.includes('@')
    ? channelByEmail(normalizeEmail(value))
    : youtubeChannelsRepository.findAll().find(c => c.status !== 'deleted' && (c.id === value || c.channelId === value));
  if (!channel) throw new Error('Không tìm thấy kênh trong app (email, hoặc id kênh)');
  return channel;
}

/** Comments still waiting for the channel, newest videos first, minus what was handled before. */
async function collect(channel: YoutubeChannel, youtubeChannelId: string, notified: CommentNotification[], flags: Record<string, string>) {
  const limit = Math.min(30, Math.max(1, Number(flags.videos) || 12));
  const days = Math.max(1, Number(flags.days) || 60);
  const snapshot = await fetchChannelSnapshot(youtubeChannelId, limit);
  const titles = new Map(snapshot.videos.map(v => [v.videoId, v.title]));
  for (const n of notified) if (!titles.has(n.videoId)) titles.set(n.videoId, '');
  const history = readHistory(channel.id);
  const fromBell = new Set(notified.map(n => n.commentId));
  const comments: ChannelComment[] = [];
  for (const [videoId, title] of titles) {
    try {
      for (const comment of await fetchVideoComments(videoId, title)) {
        if (comment.byCreator) continue;
        if (!flags.all) {
          if (comment.state === 'answered') continue;
          const done = history[comment.commentId];
          if (done && done.lastReplyId === comment.lastReplyId) continue;
          if (!fromBell.has(comment.commentId) && comment.hoursAgo !== null && comment.hoursAgo > days * 24) continue;
        }
        comments.push(comment);
      }
    } catch (err) {
      console.log(`⚠ ${videoId}: không đọc được bình luận (${(err as Error).message.slice(0, 100)})`);
    }
  }
  return { comments, videosRead: titles.size };
}

function saveRun(run: RunFile): string {
  const file = path.join(ROOT, run.channelId, 'runs', `${run.at.replace(/[:.]/g, '-')}.json`);
  writeJson(file, run);
  return file;
}

function printRun(run: RunFile, file: string) {
  const bell = new Set(run.notifications?.comments.map(n => n.commentId) ?? []);
  console.log(`\nKênh ${run.channelName}: ${run.notifications ? `${run.notifications.total} thông báo, ${run.notifications.comments.length} về bình luận` : 'không đọc chuông thông báo'}; ${run.videosRead} video, ${run.comments.length} bình luận chờ.`);
  for (const [i, c] of run.comments.entries()) {
    console.log(`\n[${i + 1}] ${c.commentId} | ${c.videoId} ${c.videoTitle.slice(0, 50)} | ${c.published} | ${c.likes} thích | ${c.state}${c.hearted ? ' | đã tim' : ''}${bell.has(c.commentId) ? ' | có thông báo' : ''}`);
    console.log(`    ${c.text.replace(/\s+/g, ' ')}`);
    for (const r of c.replies) console.log(`      ↳ ${r.byCreator ? '(kênh)' : '(người xem)'} ${r.text.replace(/\s+/g, ' ').slice(0, 200)}`);
  }
  console.log(`\nLượt đọc: ${rel(file)}`);
}

async function pull(input: string | undefined, flags: Record<string, string>) {
  const local = Boolean(flags.cdp || flags['chrome-profile']);
  const target = local ? resolveWithoutGpm(input, flags) : await resolve(input);
  const { channel } = target;
  const busy = await serverBusy();
  if (busy && !flags.force) throw new Error(`Server đang có ${busy} việc (có thể đang upload bằng profile này). Đợi xong rồi chạy lại.`);
  const knownId = channel.channelId && /^UC[\w-]{22}$/.test(channel.channelId) ? channel.channelId : undefined;
  console.log(`Kênh ${channel.name} (${channel.id})${local ? '' : ` · ${mask(target.email)}`} · đang mở trình duyệt…`);
  const opened = await openSession(target, flags);
  const inUse = opened.context.pages().some(p => !/^(about:blank|chrome:\/\/|chrome-extension:\/\/|$)/.test(p.url()));
  const page = await opened.context.newPage();
  let youtubeChannelId = '';
  let notifications: RunFile['notifications'] = null;
  try {
    youtubeChannelId = await openStudioChannel(page, LIVE_ORIGINS, knownId);
    if (!knownId) console.log(`⚠ Kênh trong app chưa có id UC. Tài khoản này mở kênh ${youtubeChannelId}: kiểm tra đúng kênh trước khi trả lời.`);
    notifications = await readCommentNotifications(page, LIVE_ORIGINS);
    if (!notifications) console.log('⚠ Không đọc được chuông thông báo; vẫn quét bình luận của các video mới.');
  } finally {
    await page.close().catch(() => undefined);
    await opened.close(inUse || Boolean(flags['keep-open']));
  }
  const { comments, videosRead } = await collect(channel, youtubeChannelId, notifications?.comments ?? [], flags);
  const run: RunFile = { channelId: channel.id, channelName: channel.name, youtubeChannelId, at: new Date().toISOString(), notifications, videosRead, comments };
  printRun(run, saveRun(run));
}

async function scan(input: string | undefined, flags: Record<string, string>) {
  const channel = findChannel(input ?? flags.channel);
  if (!channel.channelId || !/^UC[\w-]{22}$/.test(channel.channelId)) throw new Error(`Kênh ${channel.name} chưa có id UC trong app: dùng \`pull\`.`);
  const { comments, videosRead } = await collect(channel, channel.channelId, [], flags);
  const run: RunFile = { channelId: channel.id, channelName: channel.name, youtubeChannelId: channel.channelId, at: new Date().toISOString(), notifications: null, videosRead, comments };
  printRun(run, saveRun(run));
}

// ---------- plan ----------
const planSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            commentId: z.string().min(10),
            /** Why this comment gets this treatment, for the user. */
            kind: z.enum(['thanks', 'question', 'story', 'opinion', 'critic', 'request', 'spam', 'sensitive', 'other']),
            heart: z.boolean().default(false),
            reply: z.string().trim().default(''),
            /** Vietnamese meaning of the comment and of the reply, so the user can approve what they read. */
            commentVi: z.string().default(''),
            replyVi: z.string().default(''),
            reason: z.string().default(''),
            /** Set only after the user approved this item in chat. */
            approved: z.boolean().default(false),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
type PlanItem = z.infer<typeof planSchema>['items'][number];

const bigrams = (text: string) => {
  const key = commentKey(text);
  const set = new Set<string>();
  for (let i = 0; i < key.length - 1; i += 1) set.add(key.slice(i, i + 2));
  return set;
};
const overlap = (a: string, b: string) => {
  const x = bigrams(a);
  const y = bigrams(b);
  const small = Math.min(x.size, y.size);
  return small ? [...x].filter(gram => y.has(gram)).length / small : 0;
};

function validate(run: RunFile, items: PlanItem[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const earlier = Object.values(readHistory(run.channelId)).flatMap(h => (h.reply ? [h.reply] : [])).slice(-60);
  for (const item of items) {
    const at = `${item.commentId}:`;
    const comment = run.comments.find(c => c.commentId === item.commentId);
    if (!comment) {
      problems.push(`${at} không có trong lượt đọc`);
      continue;
    }
    if (seen.has(item.commentId)) problems.push(`${at} lặp trong kế hoạch`);
    seen.add(item.commentId);
    if (['spam', 'sensitive'].includes(item.kind) && (item.reply || item.heart)) problems.push(`${at} loại ${item.kind} thì không trả lời, không tim`);
    if (item.kind === 'critic' && item.heart) problems.push(`${at} bình luận chê thì không tim`);
    if (item.heart && comment.hearted) problems.push(`${at} đã có tim`);
    if (!item.reply) continue;
    if (comment.state === 'answered') problems.push(`${at} kênh đã trả lời`);
    if (!item.replyVi.trim()) problems.push(`${at} thiếu replyVi (nghĩa tiếng Việt để người dùng duyệt)`);
    if (item.reply.length > MAX_REPLY_CHARS) problems.push(`${at} trả lời ${item.reply.length} ký tự (tối đa ${MAX_REPLY_CHARS})`);
    if (/https?:|www\.|\.com\b|@[\w.-]{3,}|\d{2,4}[-‐]\d{2,4}[-‐]\d{3,4}/i.test(item.reply)) problems.push(`${at} trả lời có link, @, hoặc số điện thoại`);
    if (/〇〇|○○|××|\[[^\]]*\]|\{[^}]*\}/.test(item.reply)) problems.push(`${at} trả lời còn ô trống`);
    if (/[ぁ-んァ-ヶ]/.test(comment.text) && !/[ぁ-んァ-ヶ]/.test(item.reply)) problems.push(`${at} bình luận tiếng Nhật nhưng trả lời không phải tiếng Nhật`);
    if (commentKey(item.reply) === commentKey(comment.text)) problems.push(`${at} trả lời chép lại bình luận`);
    const twin = items.find(other => other !== item && other.reply && overlap(other.reply, item.reply) > TEMPLATE_LIMIT);
    if (twin) problems.push(`${at} gần giống câu trả lời cho ${twin.commentId}: viết riêng cho từng người`);
    const old = earlier.find(reply => overlap(reply, item.reply) > TEMPLATE_LIMIT);
    if (old) problems.push(`${at} gần giống câu đã gửi trước đây 「${old.slice(0, 40)}」`);
  }
  const approved = items.filter(i => i.approved);
  if (approved.filter(i => i.reply).length > MAX_REPLIES) problems.push(`quá ${MAX_REPLIES} trả lời một lượt`);
  if (approved.filter(i => i.heart).length > MAX_HEARTS) problems.push(`quá ${MAX_HEARTS} tim một lượt`);
  return problems;
}

function loadPlan(runFile: string | undefined, planFile: string | undefined) {
  if (!runFile || !planFile) throw new Error('Cần <run.json> và plan.json');
  const file = runFile.startsWith('server/') ? path.join(REPO_ROOT, runFile) : path.resolve(runFile);
  const run = safeJson<RunFile>(file);
  if (!run?.comments) throw new Error(`Không đọc được lượt đọc: ${runFile}`);
  const parsed = planSchema.safeParse(JSON.parse(fs.readFileSync(planFile, 'utf8')));
  if (!parsed.success) throw new Error(parsed.error.issues.map(i => `- ${i.path.join('.')}: ${i.message}`).join('\n'));
  return { run, items: parsed.data.items };
}

function check(args: string[]) {
  const { run, items } = loadPlan(args[0], args[1]);
  const problems = validate(run, items);
  console.log(`${items.length} mục: ${items.filter(i => i.reply).length} trả lời, ${items.filter(i => i.heart).length} tim, ${items.filter(i => !i.reply && !i.heart).length} bỏ qua; đã duyệt ${items.filter(i => i.approved).length}.`);
  const missing = run.comments.filter(c => !items.some(i => i.commentId === c.commentId));
  if (missing.length) console.log(`⚠ ${missing.length} bình luận chưa có trong kế hoạch: ${missing.map(c => c.commentId).join(', ')}`);
  if (problems.length) {
    console.log(`CHƯA ĐẠT:\n- ${problems.join('\n- ')}`);
    process.exitCode = 1;
  } else console.log('ĐẠT.');
}

async function send(args: string[], flags: Record<string, string>) {
  const local = Boolean(flags.cdp || flags['chrome-profile']);
  const [input, runFile, planFile] = local && flags.channel ? [undefined, args[0], args[1]] : args;
  const { run, items } = loadPlan(runFile, planFile);
  const problems = validate(run, items);
  if (problems.length) throw new Error(`Kế hoạch chưa đạt:\n- ${problems.join('\n- ')}`);
  const todo = items.filter(i => i.approved && (i.reply || i.heart));
  if (!todo.length) throw new Error('Không có mục nào được duyệt (approved: true).');
  const target = local ? resolveWithoutGpm(input, flags) : await resolve(input);
  const { channel } = target;
  if (channel.id !== run.channelId) throw new Error(`Lượt đọc thuộc kênh ${run.channelName}, không phải ${channel.name}.`);
  const busy = await serverBusy();
  if (busy && !flags.force) throw new Error(`Server đang có ${busy} việc. Đợi xong rồi chạy lại.`);
  const dry = Boolean(flags['dry-run']);

  console.log(`${dry ? 'THỬ (không gửi)' : 'GỬI'}: ${todo.filter(i => i.reply).length} trả lời, ${todo.filter(i => i.heart).length} tim · kênh ${channel.name}`);
  const opened = await openSession(target, flags);
  const inUse = opened.context.pages().some(p => !/^(about:blank|chrome:\/\/|chrome-extension:\/\/|$)/.test(p.url()));
  const page = await opened.context.newPage();
  const history = readHistory(channel.id);
  let confirmedIdentity = false;
  let failures = 0;
  try {
    await openStudioChannel(page, LIVE_ORIGINS, run.youtubeChannelId);
    for (const [index, item] of todo.entries()) {
      const comment = run.comments.find(c => c.commentId === item.commentId)!;
      const head = `${index + 1}/${todo.length} ${comment.commentId}`;
      const entry: Handled = { ...history[comment.commentId], videoId: comment.videoId, lastReplyId: comment.lastReplyId };
      if (entry.repliedAt && history[comment.commentId]?.lastReplyId === comment.lastReplyId && item.reply) {
        console.log(`${head}: đã trả lời trước đó, bỏ qua`);
        continue;
      }
      try {
        const box = await openComment(page, LIVE_ORIGINS, comment);
        if (!comment.hearted && !(await actsAsOwner(box))) throw new StudioAccessError('trang không ở vai chủ kênh (không có nút tim): dừng, để khỏi trả lời bằng tài khoản khác');
        if (item.reply) {
          await replyToComment(page, box, item.reply, !dry);
          if (!dry) {
            entry.repliedAt = new Date().toISOString();
            entry.reply = item.reply;
            history[comment.commentId] = entry;
            writeJson(historyFile(channel.id), history);
          }
        }
        if (item.heart && !dry) {
          await heartComment(page, box);
          entry.heartedAt = new Date().toISOString();
          history[comment.commentId] = entry;
          writeJson(historyFile(channel.id), history);
        }
        let note = '';
        if (!dry && item.reply && !confirmedIdentity) {
          // The first public reply proves who we are posting as; a wrong account must not post a second one.
          await page.waitForTimeout(8000);
          const seen = await confirmAction(comment, item.reply).catch(() => null);
          if (seen?.replied && !seen.byCreator) throw new StudioAccessError('trả lời vừa gửi KHÔNG đứng tên chủ kênh: dừng ngay, kiểm tra và xoá bằng tay nếu cần');
          confirmedIdentity = Boolean(seen?.byCreator);
          note = confirmedIdentity ? ' · đã thấy trên trang, đúng tên kênh' : ' · chưa thấy trên trang công khai (YouTube có thể chậm hoặc giữ lại)';
        }
        console.log(`${head}: ${[item.reply ? (dry ? 'điền thử rồi huỷ' : 'đã trả lời') : '', item.heart ? (dry ? 'sẽ tim' : 'đã tim') : ''].filter(Boolean).join(', ')}${note}`);
      } catch (err) {
        failures += 1;
        console.log(`${head}: LỖI ${(err as Error).message.slice(0, 200)}`);
        if (!(err instanceof CommentActionError)) throw err;
        if (failures >= 3) throw new Error('3 lỗi: dừng để kiểm tra.');
      }
      // Human pace: a burst of replies looks like spam to YouTube and to viewers.
      if (index < todo.length - 1) await page.waitForTimeout(dry ? 1500 : 15_000 + Math.round(Math.random() * 20_000));
    }
  } finally {
    await page.close().catch(() => undefined);
    await opened.close(inUse || Boolean(flags['keep-open']));
  }
  if (!dry) {
    for (const item of items.filter(i => i.approved && !i.reply && !i.heart)) {
      const comment = run.comments.find(c => c.commentId === item.commentId)!;
      history[item.commentId] = { ...history[item.commentId], videoId: comment.videoId, skippedAt: new Date().toISOString(), reason: item.reason, lastReplyId: comment.lastReplyId };
    }
    writeJson(historyFile(channel.id), history);
  }
}

function showHistory(input: string | undefined) {
  const channel = findChannel(input);
  const entries = Object.entries(readHistory(channel.id));
  for (const [id, h] of entries.slice(-80)) console.log([id, h.videoId, h.repliedAt ? `trả lời ${h.repliedAt.slice(0, 10)}: ${h.reply?.slice(0, 80)}` : '', h.heartedAt ? `tim ${h.heartedAt.slice(0, 10)}` : '', h.skippedAt ? `bỏ qua: ${h.reason}` : ''].filter(Boolean).join(' | '));
  console.log(`${entries.length} bình luận đã xử lý của kênh ${channel.name}.`);
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  const { flags, rest } = parseArgs(argv);
  if (command === 'pull') return pull(rest[0], flags);
  if (command === 'scan') return scan(rest[0], flags);
  if (command === 'check') return check(rest);
  if (command === 'send') return send(rest, flags);
  if (command === 'history') return showHistory(rest[0]);
  throw new Error('Usage: audience pull <email> | scan <email|channel id> | check <run.json> plan.json | send <email> <run.json> plan.json [--dry-run] | history <email|channel id>');
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
