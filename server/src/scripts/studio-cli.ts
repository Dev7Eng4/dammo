/**
 * CLI of the jp-psy-studio skill: from an email to the channel and its GPM profile, then YouTube Studio analytics
 * of the newest published videos. Read-only; the raw pages and the numbers stay in data/studio-skill (not in git).
 *
 *   npm run -s studio -- resolve <email>
 *   npm run -s studio -- pull <email> [--limit 10] [--videos id,id] [--shorts] [--resume] [--keep-open]
 *   npm run -s studio -- pull --channel <app id> --cdp http://127.0.0.1:9222   # a Chrome the user opened, instead of GPM
 *   npm run -s studio -- pull --channel <app id> --chrome-profile "main profile"   # a Chrome profile of the app
 *   npm run -s studio -- record <run folder> metrics.json      # numbers Claude read → history + ctr-log.csv
 *   npm run -s studio -- record --channel <app id> metrics.json   # same, read in the user's own Chrome (title + source per video)
 *   npm run -s studio -- history <email | channel id> [--video <id>]
 *
 * The profile must already be signed in: this never enters a password or answers a Google check.
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { paths, youtubeChannelDir } from '../config/paths.js';
import { readJson, writeJson } from '../infrastructure/storage/json-store.js';
import { videoPrepareRepository } from '../modules/youtube-channels/video-prepare.repository.js';
import { youtubeChannelsRepository } from '../modules/youtube-channels/youtube-channels.repository.js';
import type { YoutubeChannel } from '../modules/youtube-channels/youtube-channels.types.js';
import { channelByEmail, mask, normalizeEmail, openSession, resolve, resolveWithoutGpm, serverBusy } from './lib/channel-browser.js';
import { dumpVideoAnalytics, listPublishedVideos, LIVE_ORIGINS, openStudioChannel, StudioAccessError, type VideoTabDump } from './lib/studio-reader.js';

const ROOT = path.join(paths.dataDir, 'studio-skill');
const REPO_ROOT = path.resolve(paths.dataDir, '../..');
const CTR_LOG = path.join(REPO_ROOT, 'docs', 'brains', 'ctr', 'ctr-log.csv');
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;

const rel = (file: string) => path.relative(REPO_ROOT, file).replaceAll('\\', '/');

function parseArgs(argv: string[]) {
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (['--shorts', '--resume', '--keep-open', '--force'].includes(arg)) flags[arg.slice(2)] = '1';
    else if (arg.startsWith('--')) flags[arg.slice(2)] = argv[(i += 1)] ?? '';
    else rest.push(arg);
  }
  return { flags, rest };
}

/** Local video (made by dammo) behind a published one: the uploaded title is the local title. */
function localVideo(channel: YoutubeChannel, title: string): { folder: string | null; videoId: string; cluster: string | null; hookLines: string[] } | null {
  const wanted = title.replace(/\s+/g, '');
  if (!wanted) return null;
  for (const sub of ['uploads', 'videos']) {
    const root = path.join(youtubeChannelDir(channel.id), sub);
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      const meta = safeJson(path.join(root, name, 'video-meta.json'));
      if (!meta || String(meta.metadata?.title ?? '').replace(/\s+/g, '') !== wanted) continue;
      const hook = meta.ctr_review?.after?.hookLines ?? meta.thumbnail?.hook_lines ?? [];
      const cluster = meta.ctr_review?.cluster ?? /ja-psy-k(\d+)/i.exec(channel.niche)?.[1]?.replace(/^/, 'K') ?? null;
      return { folder: rel(path.join(root, name)), videoId: name, cluster, hookLines: Array.isArray(hook) ? hook : [] };
    }
  }
  // Folders are deleted some time after the upload; the list keeps the title.
  const item = videoPrepareRepository.read(channel.id).find(entry => entry.title.replace(/\s+/g, '') === wanted);
  if (item) {
    const own = /ja-psy-k(\d+)/i.exec(channel.niche)?.[1];
    return { folder: null, videoId: item.videoId.trim(), cluster: own ? `K${own}` : null, hookLines: [] };
  }
  return null;
}

function safeJson(file: string): any {
  try {
    return readJson(file);
  } catch {
    return null;
  }
}

interface RunVideo {
  videoId: string;
  title: string;
  text: string;
  local: ReturnType<typeof localVideo>;
  tabs?: VideoTabDump[];
  error?: string;
}
interface RunFile {
  channelId: string;
  channelName: string;
  youtubeChannelId: string;
  startedAt: string;
  finishedAt?: string;
  videos: RunVideo[];
}

async function pull(input: string | undefined, flags: Record<string, string>) {
  const local = Boolean(flags.cdp || flags['chrome-profile']);
  const target = local ? resolveWithoutGpm(input, flags) : await resolve(input);
  const { channel } = target;
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(flags.limit) || DEFAULT_LIMIT));
  const busy = await serverBusy();
  if (busy && !flags.force) throw new Error(`Server đang có ${busy} việc (có thể đang upload bằng profile này). Đợi xong rồi chạy lại.`);

  const dir = path.join(ROOT, channel.id, new Date().toISOString().slice(0, 10));
  const runPath = path.join(dir, 'run.json');
  const previous = flags.resume ? (safeJson(runPath) as RunFile | null) : null;
  const knownId = channel.channelId && /^UC[\w-]{22}$/.test(channel.channelId) ? channel.channelId : undefined;

  console.log(`Kênh ${channel.name} (${channel.id})${local ? '' : ` · ${mask(target.email)}`} · đang mở trình duyệt…`);
  const session = await openSession(target, flags);
  // A profile the user already has open keeps running afterwards: only our own tab is closed.
  const inUse = session.context.pages().some(p => !/^(about:blank|chrome:\/\/|chrome-extension:\/\/|$)/.test(p.url()));
  const page = await session.context.newPage();
  try {
    const youtubeChannelId = await openStudioChannel(page, LIVE_ORIGINS, knownId);
    if (!knownId) console.log(`⚠ Kênh trong app chưa có id UC. Studio của email này mở kênh ${youtubeChannelId}: kiểm tra đúng kênh rồi điền vào app.`);
    const wanted = (flags.videos ?? '').split(',').map(id => id.trim()).filter(Boolean);
    const published = await listPublishedVideos(page, LIVE_ORIGINS, youtubeChannelId, wanted.length ? MAX_LIMIT : limit, Boolean(flags.shorts));
    const chosen = wanted.length ? published.filter(v => wanted.includes(v.videoId)) : published;
    const missing = wanted.filter(id => !published.some(v => v.videoId === id));
    if (missing.length) console.log(`⚠ Không thấy trong ${published.length} video mới nhất của kênh: ${missing.join(', ')}`);
    if (!chosen.length) throw new Error('Kênh chưa có video đã đăng nào để đọc.');

    const run: RunFile = { channelId: channel.id, channelName: channel.name, youtubeChannelId, startedAt: new Date().toISOString(), videos: [] };
    console.log(`Kênh ${youtubeChannelId}: ${chosen.length} video đã đăng gần nhất.`);
    for (const [index, video] of chosen.entries()) {
      const done = previous?.videos.find(v => v.videoId === video.videoId && v.tabs?.length);
      const entry: RunVideo = { ...video, local: localVideo(channel, video.title) };
      if (done) entry.tabs = done.tabs;
      else {
        try {
          entry.tabs = await dumpVideoAnalytics(page, LIVE_ORIGINS, video.videoId, path.join(dir, video.videoId));
        } catch (err) {
          entry.error = (err as Error).message.slice(0, 300);
          // Signed out half way: every later video would fail the same way.
          if (err instanceof StudioAccessError && /đăng nhập|captcha|đồng ý/.test(entry.error)) {
            run.videos.push(entry);
            writeJson(runPath, run);
            throw err;
          }
        }
      }
      run.videos.push(entry);
      writeJson(runPath, run);
      console.log(`${index + 1}/${chosen.length} ${video.videoId} | ${video.title.slice(0, 60)} | ${entry.error ? `LỖI ${entry.error}` : `${entry.tabs!.length} tab${done ? ' (đã đọc trước đó)' : ''}`}${entry.local ? ` | video dammo ${entry.local.videoId}` : ''}`);
      await page.waitForTimeout(1500 + Math.round(Math.random() * 2000));
    }
    run.finishedAt = new Date().toISOString();
    writeJson(runPath, run);
    console.log(`\nĐã lưu: ${rel(dir)}\n- run.json: danh sách video\n- <videoId>/<n>.txt và <n>.png: từng tab phân tích`);
  } finally {
    await page.close().catch(() => undefined);
    const keep = inUse || Boolean(flags['keep-open']);
    await session.close(keep);
    if (keep || flags.cdp) console.log(`${session.label} vẫn mở; chỉ tab của lệnh được đóng.`);
  }
}

// ---------- numbers ----------
const num = z.number().min(0).nullable().default(null);
const pct = z.number().min(0).max(100).nullable().default(null);
const videoMetrics = z
  .object({
    videoId: z.string().regex(/^[\w-]{11}$/),
    /** What Studio says the numbers cover, as shown (e.g. "Từ khi xuất bản"). */
    period: z.string().min(1),
    hoursSincePublish: num,
    views: num,
    impressions: num,
    ctrPercent: pct,
    watchHours: num,
    avgViewDurationSec: num,
    avgViewPercent: z.number().min(0).max(300).nullable().default(null),
    stillWatching30sPercent: pct,
    subscribersGained: z.number().nullable().default(null),
    likes: num,
    comments: num,
    /** "Engaged views from impressions": views can also count autoplay on the home page. */
    engagedViewsFromImpressions: num,
    uniqueViewers: num,
    newViewersPercent: pct,
    /** Share of the watch time that comes from subscribers. */
    subscribedWatchPercent: pct,
    trafficSources: z.array(z.object({ name: z.string(), percent: pct })).default([]),
    audience: z.string().default(''),
    /** Fields read off the screenshot because the text does not have them. */
    fromImage: z.array(z.string()).default([]),
    note: z.string().default(''),
    /** Only for numbers read in the user's own Chrome, where there are no saved pages: title, and the page text they come from. */
    title: z.string().optional(),
    source: z.string().optional(),
  })
  .strict();
const metricsSchema = z.object({ videos: z.array(videoMetrics).min(1) }).strict();
type VideoMetrics = z.infer<typeof videoMetrics>;
type HistoryEntry = Omit<VideoMetrics, 'title' | 'source'> & { readAt: string; title: string; localVideoId: string | null; cluster: string | null; hookLines: string[] };

const historyFile = (channelId: string) => path.join(ROOT, channelId, 'history.json');

const UNITS: Record<string, number> = { K: 1e3, N: 1e3, M: 1e6, TR: 1e6, B: 1e9, T: 1e9, 千: 1e3, 万: 1e4, 億: 1e8, 천: 1e3, 만: 1e4 };

/** Every count the text could mean: "1,234" is 1234 or 1.234, "699.4K" is 699400. */
function countsIn(text: string): number[] {
  const found: number[] = [];
  for (const match of text.matchAll(/(\d[\d.,]*)(?:[^\S\n]?(K|M|B|N|Tr|T|千|万|億|천|만)(?!\p{L}))?/giu)) {
    const digits = match[1].replace(/[.,]$/, '');
    const unit = UNITS[(match[2] ?? '').toUpperCase()] ?? 1;
    const readings = [Number(digits.replace(/[.,]/g, '')), Number(digits.replace(/[.,](?=.*[.,])/g, '').replace(',', '.'))];
    for (const value of readings) if (Number.isFinite(value)) found.push(value * unit);
  }
  return found;
}

/** Numbers Claude reports that the page does not show: a misread line, or a chart axis taken for a metric. */
function unsupported(metrics: VideoMetrics, text: string): string[] {
  // "4,2 %" and "4.2%" read the same; line breaks stay, so a number never joins the one on the line above.
  const plain = text.replaceAll(',', '.').replace(/(\d)[^\S\n]+%/g, '$1%');
  const percents: Array<[string, number | null]> = [
    ['ctrPercent', metrics.ctrPercent],
    ['avgViewPercent', metrics.avgViewPercent],
    ['stillWatching30sPercent', metrics.stillWatching30sPercent],
    ['newViewersPercent', metrics.newViewersPercent],
    ['subscribedWatchPercent', metrics.subscribedWatchPercent],
    ...metrics.trafficSources.map((s, i): [string, number | null] => [`trafficSources[${i}]`, s.percent]),
  ];
  const counts: Array<[string, number | null]> = [
    ['views', metrics.views],
    ['impressions', metrics.impressions],
    ['engagedViewsFromImpressions', metrics.engagedViewsFromImpressions],
    ['watchHours', metrics.watchHours],
    ['uniqueViewers', metrics.uniqueViewers],
    ['likes', metrics.likes],
    ['comments', metrics.comments],
  ];
  const shown = countsIn(text);
  const missing = (fields: Array<[string, number | null]>, isShown: (value: number) => boolean) =>
    fields.filter(([name, value]) => value !== null && !metrics.fromImage.includes(name) && !isShown(value)).map(([name, value]) => `${name}=${value}`);
  return [
    // No digit before it: 0% must not be found inside 70%.
    ...missing(percents, value => [String(value), value.toFixed(1), value.toFixed(2)].some(form => new RegExp(`(?<![\\d.])${form.replace('.', '\\.')}%`).test(plain))),
    ...missing(counts, value => shown.some(n => Math.abs(n - value) <= value * 0.0005 + 1e-9)),
  ];
}

const csv = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** A run read in the user's own Chrome: the page text travels inside metrics.json instead of saved files. */
function chromeRun(channelInput: string, videos: VideoMetrics[]): RunFile {
  const channel = youtubeChannelsRepository.findAll().find(c => c.status !== 'deleted' && (c.id === channelInput || c.channelId === channelInput));
  if (!channel) throw new Error(`Kênh ${channelInput} không có trong app: chỉ phân tích trong chat, không ghi.`);
  const missing = videos.filter(v => !v.title?.trim() || !v.source?.trim()).map(v => v.videoId);
  if (missing.length) throw new Error(`Đọc bằng Chrome phải kèm "title" và "source" (chữ chép từ trang): thiếu ở ${missing.join(', ')}`);
  return {
    channelId: channel.id,
    channelName: channel.name,
    youtubeChannelId: channel.channelId ?? '',
    // One reading per day: recording again the same day replaces it.
    startedAt: `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
    videos: videos.map(v => ({ videoId: v.videoId, title: v.title!, text: '', local: localVideo(channel, v.title!) })),
  };
}

function record(args: string[], flags: Record<string, string>) {
  const file = args.at(-1);
  const folder = flags.channel ? undefined : args[0];
  if (!file || (!flags.channel && args.length < 2)) throw new Error('Usage: studio record <thư mục lượt đọc> metrics.json | record --channel <id kênh trong app> metrics.json');
  const parsed = metricsSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (!parsed.success) throw new Error(parsed.error.issues.map(i => `- ${i.path.join('.')}: ${i.message}`).join('\n'));
  let run: RunFile | null;
  if (folder) {
    const dir = path.resolve(folder.startsWith('server/') ? path.join(REPO_ROOT, folder) : folder);
    run = safeJson(path.join(dir, 'run.json')) as RunFile | null;
    if (!run) throw new Error(`Không có run.json trong ${folder}`);
  } else run = chromeRun(flags.channel, parsed.data.videos);

  const problems: string[] = [];
  const entries: HistoryEntry[] = [];
  for (const { title: _title, source, ...metrics } of parsed.data.videos) {
    const video = run.videos.find(v => v.videoId === metrics.videoId);
    if (!video || (folder && !video.tabs?.length)) {
      problems.push(`${metrics.videoId}: không có trong lượt đọc này`);
      continue;
    }
    const text = folder ? video.tabs!.map(tab => (fs.existsSync(tab.textFile) ? fs.readFileSync(tab.textFile, 'utf8') : '')).join('\n') : source!;
    const bad = unsupported(metrics, text);
    if (bad.length) {
      problems.push(`${metrics.videoId}: số không có trong trang đã đọc: ${bad.join(', ')} (đọc lại, hoặc ghi vào fromImage nếu lấy từ ảnh)`);
      continue;
    }
    entries.push({ ...metrics, readAt: run.startedAt, title: video.title, localVideoId: video.local?.videoId ?? null, cluster: video.local?.cluster ?? null, hookLines: video.local?.hookLines ?? [] });
  }

  const store = (safeJson(historyFile(run.channelId)) as HistoryEntry[] | null) ?? [];
  const kept = store.filter(old => !entries.some(e => e.videoId === old.videoId && e.readAt === old.readAt));
  if (entries.length) writeJson(historyFile(run.channelId), [...kept, ...entries]);

  // Real CTR is what the ctr skill learns from. One row per video and day.
  const ours = Boolean(youtubeChannelsRepository.findById(run.channelId));
  const withCtr = ours ? entries.filter(e => e.ctrPercent !== null) : [];
  if (withCtr.length) {
    fs.mkdirSync(path.dirname(CTR_LOG), { recursive: true });
    const header = 'ngay,videoId,cum,title,chu_bia,kieu_cap,ctr_phan_tram,luot_hien_thi,gio_sau_dang,ghi_chu';
    const existing = fs.existsSync(CTR_LOG) ? fs.readFileSync(CTR_LOG, 'utf8').trimEnd().split(/\r?\n/) : [header];
    const day = run.startedAt.slice(0, 10);
    const rows = withCtr.map(e =>
      [day, e.localVideoId ?? e.videoId, e.cluster, e.title, e.hookLines.join(' / '), '', e.ctrPercent, e.impressions, e.hoursSincePublish, `studio ${e.videoId}`].map(csv).join(','),
    );
    const ids = new Set(withCtr.map(e => e.videoId));
    const fresh = existing.filter(line => !(line.startsWith(`${day},`) && [...ids].some(id => line.endsWith(`studio ${id}`))));
    fs.writeFileSync(CTR_LOG, `${[...fresh, ...rows].join('\n')}\n`, 'utf8');
  }
  console.log(`Đã ghi ${entries.length} video vào lịch sử${withCtr.length ? `, ${withCtr.length} dòng CTR vào ${rel(CTR_LOG)}` : ''}.`);
  if (problems.length) {
    console.log(`Bỏ ${problems.length}:\n- ${problems.join('\n- ')}`);
    process.exitCode = 1;
  }
}

function history(input: string | undefined, flags: Record<string, string>) {
  const channel = input?.includes('@') ? channelByEmail(normalizeEmail(input)) : youtubeChannelsRepository.findById(input ?? '');
  if (!channel) throw new Error('Không tìm thấy kênh (email hoặc id kênh trong app)');
  const entries = ((safeJson(historyFile(channel.id)) as HistoryEntry[] | null) ?? []).filter(e => !flags.video || e.videoId === flags.video);
  if (!entries.length) {
    console.log(`Kênh ${channel.name}: chưa có lần đọc nào.`);
    return;
  }
  for (const e of entries.sort((a, b) => a.videoId.localeCompare(b.videoId) || a.readAt.localeCompare(b.readAt))) {
    console.log(
      [e.readAt.slice(0, 10), e.videoId, e.title.slice(0, 50), `${e.hoursSincePublish ?? '?'}h`, `view ${e.views ?? '?'}`, `hiển thị ${e.impressions ?? '?'}`, `CTR ${e.ctrPercent ?? '?'}%`, e.engagedViewsFromImpressions != null ? `xem thật từ hiển thị ${e.engagedViewsFromImpressions}` : '', `xem TB ${e.avgViewDurationSec ?? '?'}s (${e.avgViewPercent ?? '?'}%)`, `30s ${e.stillWatching30sPercent ?? '?'}%`, e.cluster ?? ''].filter(Boolean).join(' | '),
    );
  }
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  const { flags, rest } = parseArgs(argv);
  if (command === 'resolve') {
    const { email, channel, profileId } = await resolve(rest[0]);
    console.log(JSON.stringify({ email: mask(email), channelId: channel.id, name: channel.name, handle: channel.handle, status: channel.status, youtubeChannelId: channel.channelId ?? null, niche: channel.niche, gpmProfileId: profileId }, null, 2));
    return;
  }
  if (command === 'pull') return pull(rest[0], flags);
  if (command === 'record') return record(rest, flags);
  if (command === 'history') return history(rest[0], flags);
  throw new Error('Usage: studio resolve <email> | pull <email> [--limit 10] [--videos id,id] [--shorts] [--resume] [--keep-open] [--channel <id> --chrome-profile <tên> | --cdp <url>] | record <folder> metrics.json | history <email|channelId>');
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
