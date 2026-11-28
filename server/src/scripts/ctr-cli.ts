/**
 * CLI of the jp-psy-ctr Claude Code skill: which videos still need a title + thumbnail review, and how the
 * result is stored and applied. Scoring and writing are done by Claude; everything that must be exact is here.
 *
 *   npm run -s ctr -- scan [<channel>] [<video>] [--status Created] [--force] [--json]
 *   npm run -s ctr -- info <video>
 *   npm run -s ctr -- review <video> review.json            # stores the score; >= 8 marks the video done
 *   npm run -s ctr -- draw <video> proposal.json            # draws into <video>/ctr-work/, replaces nothing
 *   npm run -s ctr -- apply <video> proposal.json           # backup, new title + thumbnail, marks the video done
 *   npm run -s ctr -- keep <video> --reason "..."           # old pair stays, marks the video done
 *   npm run -s ctr -- restore <video>                       # puts the last backup back, clears the state
 *
 * <channel> / <video> are ids or folder paths. State lives in video-meta.json as `ctr_review`; regenerating the
 * metadata in the app writes a new video-meta.json without it, so such a video is reviewed again.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { env } from '../config/env.js';
import { resolveVoicevoxCredit, withVoicevoxCredit } from '../modules/voice/voicevox-credit.js';
import { paths, resolveYoutubeChannelUploadedVideoDir, resolveYoutubeChannelVideoDir } from '../config/paths.js';
import { readJson, writeJson } from '../infrastructure/storage/json-store.js';
import { nichesRepository } from '../modules/niches/niches.repository.js';
import { resolveChannelMascotImagePath } from '../modules/video-production/shared/ai-video/ai-video-channel-mascots.js';
import { pickRandomCelebrityImagePath } from '../modules/video-production/shared/celebrity-image.js';
import { isCelebrityWisdomNiche } from '../modules/video-production/shared/meta/metadata.types.js';
import { hasNicheMetadataPrompt, resolveMetadataPrompt } from '../modules/video-production/shared/meta/run-metadata.js';
import { checkTitleGuards, findUnsupportedPromises, findUnsupportedStats } from '../modules/video-production/shared/meta/title-guard.js';
import { findThumbnailPath } from '../modules/youtube-upload/upload-assets.js';
import { videoPrepareRepository } from '../modules/youtube-channels/video-prepare.repository.js';
import { youtubeChannelsRepository } from '../modules/youtube-channels/youtube-channels.repository.js';
import type { YoutubeChannel } from '../modules/youtube-channels/youtube-channels.types.js';

const PASS_SCORE = 8;
/** A review with a blocking error never scores above this, whatever the sub-scores add up to. */
const BLOCKED_MAX_SCORE = 5;
const WORK_DIRNAME = 'ctr-work';
const BACKUP_DIRNAME = 'ctr-backup';
const DRAWN_FILENAME = 'thumbnail.jpg';

/** Points per criterion (sum 100). Names match .claude/skills/jp-psy-ctr/references/review.md. */
const MAX_POINTS = {
  C1: 10, C2: 10, C3: 8, C4: 6, C5: 6,
  T1: 8, T2: 8, T3: 6, T4: 4, T5: 4,
  B1: 7, B2: 4, B3: 9, B4: 6, B5: 4,
} as const;
type Criterion = keyof typeof MAX_POINTS;
const CRITERIA = Object.keys(MAX_POINTS) as Criterion[];

const scoresSchema = z.object(
  Object.fromEntries(CRITERIA.map(key => [key, z.number().min(0).max(MAX_POINTS[key])])) as Record<Criterion, z.ZodNumber>,
).strict();

const reviewSchema = z.object({
  /** K1–K11, or "off" when the content is outside every cluster. */
  cluster: z.string().regex(/^(K([1-9]|1[01])|off)$/),
  clusterReason: z.string().min(1),
  topic: z.string().min(1),
  scores: scoresSchema,
  blocking: z.array(z.string()).default([]),
  issues: z.array(z.string()).default([]),
});

const proposalSchema = z.object({
  title: z.string().trim().min(1).max(100),
  hookLines: z.array(z.string().trim().min(1)).min(1).max(5),
  emphasis: z.string().default(''),
  hook: z.string().min(1),
  alternativeTitles: z.array(z.string().trim().min(1)).default([]),
  /** Full English image prompt with every Japanese text line inside. */
  thumbnailPrompt: z.string().min(50),
  /** Keys to overwrite in the stored `thumbnail` plan (its shape differs per channel prompt). */
  thumbnailPatch: z.record(z.string(), z.unknown()).default({}),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
  /** Score of the new pair, judged on the image `draw` produced. Required by `apply`. */
  after: reviewSchema.optional(),
});

type Review = z.infer<typeof reviewSchema>;
type Scored = { total: number; pair: number; title: number; thumbnail: number };

/** done = passed | improved | kept (skipped by scan); needs_work resumes at the creation step. */
type CtrStatus = 'passed' | 'improved' | 'kept' | 'needs_work';
interface CtrReview {
  skill: 'jp-psy-ctr';
  status: CtrStatus;
  reviewedAt: string;
  cluster: string;
  clusterReason: string;
  topic: string;
  score: number;
  parts: Scored;
  scores: Record<string, number>;
  blocking: string[];
  issues: string[];
  /** What was judged, to notice a later change of title or image. */
  title: string;
  thumbnailHash: string | null;
  after?: { score: number; parts: Scored; scores: Record<string, number>; title: string; hookLines: string[]; hook: string; appliedAt: string; thumbnailHash: string | null; backup: string };
  keptReason?: string;
}
const DONE: CtrStatus[] = ['passed', 'improved', 'kept'];

function score(review: Review): Scored {
  const sum = (prefix: string) =>
    CRITERIA.filter(key => key.startsWith(prefix)).reduce((total, key) => total + review.scores[key], 0);
  const pair = sum('C');
  const title = sum('T');
  const thumbnail = sum('B');
  const raw = Math.round(pair + title + thumbnail) / 10;
  return { total: review.blocking.length ? Math.min(raw, BLOCKED_MAX_SCORE) : raw, pair, title, thumbnail };
}

const rel = (file: string) => path.relative(path.resolve(paths.dataDir, '../..'), file).replaceAll('\\', '/');
const hashFile = (file: string | null): string | null =>
  file && fs.existsSync(file) ? crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 16) : null;

function parseArgs(argv: string[]) {
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--force' || arg === '--json') flags[arg.slice(2)] = '1';
    else if (arg.startsWith('--')) flags[arg.slice(2)] = argv[(i += 1)] ?? '';
    else rest.push(arg);
  }
  return { flags, rest };
}

// ---------- targets ----------
interface Target {
  channel: YoutubeChannel;
  videoId: string;
}

/** "…/youtube-channels/<channel>[/videos/<video>]" with either slash, or a bare id. */
function parseTarget(input: string): { channelId?: string; videoId?: string; bare?: string } {
  const parts = input.replaceAll('\\', '/').replace(/\/+$/, '').split('/');
  const at = parts.lastIndexOf('youtube-channels');
  if (at === -1) {
    if (parts.length > 1) throw new Error(`Đường dẫn không nằm trong youtube-channels: ${input}`);
    return { bare: input.trim() };
  }
  const channelId = parts[at + 1];
  const tail = parts.slice(at + 2).filter(part => part !== 'videos');
  return { channelId, videoId: tail[0] };
}

function requireChannel(id: string): YoutubeChannel {
  const channel = youtubeChannelsRepository.findById(id);
  if (!channel || channel.status === 'deleted') throw new Error(`Không có kênh ${id} (hoặc kênh đã xoá)`);
  return channel;
}

function channelsOwning(videoId: string): YoutubeChannel[] {
  return youtubeChannelsRepository
    .findAll()
    .filter(c => c.status !== 'deleted' && videoPrepareRepository.read(c.id).some(item => item.videoId.trim() === videoId));
}

function resolveInput(args: string[]): { channel?: YoutubeChannel; videoId?: string } {
  let channel: YoutubeChannel | undefined;
  let videoId: string | undefined;
  for (const arg of args) {
    const target = parseTarget(arg);
    if (target.channelId) channel = requireChannel(target.channelId);
    if (target.videoId) videoId = target.videoId;
    if (target.bare) {
      const found = youtubeChannelsRepository.findById(target.bare);
      if (found) channel = requireChannel(target.bare);
      else videoId = target.bare;
    }
  }
  if (videoId && !channel) {
    const owners = channelsOwning(videoId);
    if (owners.length === 0) throw new Error(`Không tìm thấy kênh hay video "${videoId}"`);
    if (owners.length > 1) throw new Error(`Video ${videoId} có ở ${owners.length} kênh, thêm id kênh: ${owners.map(c => c.id).join(', ')}`);
    channel = owners[0];
  }
  return { channel, videoId };
}

function requireTarget(args: string[]): Target & { dir: string; metaFile: string } {
  const { channel, videoId } = resolveInput(args);
  if (!channel || !videoId) throw new Error('Cần một video (id hoặc đường dẫn thư mục)');
  const dir = resolveYoutubeChannelVideoDir(channel.id, videoId);
  if (!dir) throw new Error(`Không có thư mục của video ${videoId}`);
  return { channel, videoId, dir, metaFile: path.join(dir, 'video-meta.json') };
}

// ---------- video data ----------
type Meta = Record<string, any>;
const readMeta = (file: string): Meta | null => {
  try {
    return readJson<Meta>(file);
  } catch {
    return null;
  }
};
const metadataOf = (meta: Meta): Meta => meta.result?.metadata ?? meta.metadata ?? {};

/** Thumbnail text as stored by any of the meta prompts (cluster plan, telop, quote lines). */
function storedHookLines(plan: any): string[] {
  if (!plan || typeof plan !== 'object') return [];
  if (Array.isArray(plan.hook_lines)) return plan.hook_lines.filter((line: unknown) => typeof line === 'string' && line.trim());
  const telop = plan.telop_japanese;
  const from = (source: any, keys: string[]) => keys.map(key => source?.[key]?.text ?? source?.[key]).filter((v: unknown): v is string => typeof v === 'string' && v.trim() !== '');
  if (telop && typeof telop === 'object') {
    return from(telop, Object.keys(telop).filter(key => !/color|accent|emphasis|note/i.test(key)));
  }
  return from(plan, ['line_1', 'line_2', 'line_3', 'vertical_name_tag']);
}

function transcriptFile(dir: string): string | null {
  for (const name of ['script.txt', 'transcript.srt', 'transcript.ja.srt', 'narration/transcript.srt']) {
    const file = path.join(dir, name);
    if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  }
  return null;
}

function transcriptText(dir: string): string {
  const file = transcriptFile(dir);
  if (!file) return '';
  const raw = fs.readFileSync(file, 'utf-8');
  if (!file.endsWith('.srt')) return raw;
  return raw.split(/\r?\n/).filter(line => line.trim() && !/^\d+$/.test(line.trim()) && !line.includes('-->')).join('\n');
}

const nicheLabel = (id: string) => nichesRepository.findByKey(id)?.label ?? id;
const nicheCluster = (id: string) => /ja-psy-k(\d+)/i.exec(id)?.[1];

async function drawFlow(channel: YoutubeChannel): Promise<{ flow: 'celebrity' | 'mascot' | 'prompt'; references: string[]; note?: string }> {
  if (isCelebrityWisdomNiche(channel.niche)) {
    if (!channel.celebrityId) return { flow: 'celebrity', references: [], note: 'kênh thiếu celebrityId, không vẽ được' };
    return { flow: 'celebrity', references: [] };
  }
  const mascot = channel.mascotThumbnailCandidates ? await resolveChannelMascotImagePath(channel.id) : undefined;
  if (mascot) return { flow: 'mascot', references: [mascot] };
  const own = hasNicheMetadataPrompt(channel.language, channel.niche);
  return { flow: 'prompt', references: [], ...(own ? {} : { note: 'kênh không có prompt meta riêng: giữ phong cách theo image_generation_prompt hiện tại' }) };
}

function channelPromptFiles(channel: YoutubeChannel): string[] {
  const log = console.log;
  console.log = () => {}; // resolveMetadataPrompt narrates on stdout
  try {
    // Two-step prompts are registered per step but stored in one folder.
    const key = resolveMetadataPrompt(channel.language, channel.niche).key.replace(/_step_\d+$/, '');
    for (const lang of [channel.language, 'all']) {
      const dir = path.join(paths.dataDir, 'prompts', lang, key);
      if (fs.existsSync(dir)) return fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort().map(f => rel(path.join(dir, f)));
    }
  } catch {
    // no prompt at all: the current image prompt is the only reference
  } finally {
    console.log = log;
  }
  return [];
}

const CTR_LOG = path.resolve(paths.dataDir, '../..', 'docs', 'brains', 'ctr', 'ctr-log.csv');

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cell); cell = ''; }
    else cell += ch;
  }
  cells.push(cell);
  return cells;
}

interface MeasuredVideo {
  videoId: string; title: string; hookLines: string; ctrPercent: number; impressions: number | null;
  hoursSincePublish: number | null; measuredOn: string; thumbnail: string | null;
}

/**
 * Real Studio CTR of this channel's own published videos (docs/brains/ctr/ctr-log.csv, written by jp-psy-studio),
 * best first. The thumbnails of the top rows are the channel's proven look: keep it.
 */
function measuredVideos(channel: YoutubeChannel): { videos: MeasuredVideo[]; medianCtr: number | null } {
  if (!fs.existsSync(CTR_LOG)) return { videos: [], medianCtr: null };
  const [header, ...lines] = fs.readFileSync(CTR_LOG, 'utf8').trim().split(/\r?\n/);
  const cols = parseCsvLine(header);
  const col = (cells: string[], name: string) => cells[cols.indexOf(name)] ?? '';
  const latest = new Map<string, MeasuredVideo>();
  for (const line of lines) {
    const cells = parseCsvLine(line);
    const id = col(cells, 'videoId').trim();
    const ctr = Number(col(cells, 'ctr_phan_tram'));
    if (!id || !Number.isFinite(ctr) || col(cells, 'ctr_phan_tram') === '') continue;
    const dir = resolveYoutubeChannelUploadedVideoDir(channel.id, id) ?? resolveYoutubeChannelVideoDir(channel.id, id);
    if (!dir) continue;
    const day = col(cells, 'ngay');
    const prev = latest.get(id);
    if (prev && prev.measuredOn > day) continue;
    const num = (name: string) => (col(cells, name) === '' ? null : Number(col(cells, name)));
    const thumb = findThumbnailPath(dir);
    latest.set(id, {
      videoId: id, title: col(cells, 'title'), hookLines: col(cells, 'chu_bia'), ctrPercent: ctr,
      impressions: num('luot_hien_thi'), hoursSincePublish: num('gio_sau_dang'), measuredOn: day, thumbnail: thumb ? rel(thumb) : null,
    });
  }
  const videos = [...latest.values()].sort((a, b) => b.ctrPercent - a.ctrPercent);
  const ctrs = videos.map(v => v.ctrPercent).sort((a, b) => a - b);
  const medianCtr = ctrs.length ? (ctrs.length % 2 ? ctrs[(ctrs.length - 1) / 2] : (ctrs[ctrs.length / 2 - 1] + ctrs[ctrs.length / 2]) / 2) : null;
  return { videos, medianCtr };
}

function siblingVideos(channel: YoutubeChannel, videoId: string, limit = 6): Array<{ videoId: string; title: string; hookLines: string[]; thumbnail: string | null }> {
  return videoPrepareRepository
    .read(channel.id)
    .filter(item => item.videoId.trim() !== videoId && (item.status === 'Created' || item.status === 'Prepared' || item.status === 'Preparing'))
    .map(item => ({ videoId: item.videoId.trim(), dir: resolveYoutubeChannelVideoDir(channel.id, item.videoId.trim()) }))
    .filter((item): item is { videoId: string; dir: string } => Boolean(item.dir))
    .map(item => ({ ...item, meta: readMeta(path.join(item.dir, 'video-meta.json')), at: fs.statSync(item.dir).mtimeMs }))
    .filter(item => item.meta)
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map(item => {
      const thumb = findThumbnailPath(item.dir);
      return { videoId: item.videoId, title: metadataOf(item.meta!).title ?? '', hookLines: storedHookLines(item.meta!.thumbnail), thumbnail: thumb ? rel(thumb) : null };
    });
}

function stateOf(meta: Meta | null): CtrReview | null {
  const state = meta?.ctr_review;
  return state && state.skill === 'jp-psy-ctr' ? (state as CtrReview) : null;
}

/** Title or image differs from what the skill last judged / applied. */
function changedSince(state: CtrReview, title: string, thumb: string | null): boolean {
  const last = state.after ?? state;
  return last.title !== title || last.thumbnailHash !== hashFile(thumb);
}

// ---------- scan ----------
function scan(args: string[], flags: Record<string, string>) {
  const { channel, videoId } = resolveInput(args);
  const wanted = flags.status || 'Created';
  const channels = channel ? [channel] : youtubeChannelsRepository.findAll().filter(c => c.status !== 'deleted');
  const rows: Array<Record<string, unknown>> = [];
  for (const c of channels) {
    const items = videoPrepareRepository
      .read(c.id)
      .filter(item => (videoId ? item.videoId.trim() === videoId : item.status === wanted));
    for (const item of items) {
      const dir = resolveYoutubeChannelVideoDir(c.id, item.videoId.trim());
      const meta = dir ? readMeta(path.join(dir, 'video-meta.json')) : null;
      const title = meta ? (metadataOf(meta).title ?? '') : '';
      const thumb = dir ? findThumbnailPath(dir) : null;
      const state = stateOf(meta);
      let todo = 'review';
      let reason = '';
      if (!dir) [todo, reason] = ['blocked', 'không có thư mục video'];
      else if (!meta && transcriptFile(dir)) [todo, reason] = ['init', 'chưa có video-meta.json (đọc giọng tay): chạy `init` rồi làm như thường'];
      else if (!meta || !title) [todo, reason] = ['blocked', 'thiếu video-meta.json hoặc title'];
      else if (!transcriptFile(dir)) [todo, reason] = ['blocked', 'thiếu transcript'];
      else if (item.status !== 'Created' && item.status !== 'Prepared' && item.status !== 'Preparing') [todo, reason] = ['blocked', `trạng thái ${item.status}: chỉ sửa được video Preparing / Prepared / Created`];
      else if (state && DONE.includes(state.status) && !flags.force) {
        [todo, reason] = ['done', `${state.status} ${state.after?.score ?? state.score}/10 ngày ${state.reviewedAt.slice(0, 10)}`];
        if (changedSince(state, title, thumb)) reason += ' · title hoặc bìa đã đổi sau đó (dùng --force để chấm lại)';
      } else if (state?.status === 'needs_work' && !flags.force && !changedSince(state, title, thumb)) {
        [todo, reason] = ['create', `đã chấm ${state.score}/10, còn bước tạo mới`];
      }
      rows.push({
        todo, reason, channelId: c.id, channel: c.name, niche: nicheLabel(c.niche), language: c.language,
        videoId: item.videoId.trim(), status: item.status, title, thumbnail: Boolean(thumb), dir: dir ? rel(dir) : null,
      });
    }
  }
  if (videoId && rows.length === 0) throw new Error(`Video ${videoId} không có trong video-prepare.json của kênh`);
  if (flags.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  const count = (todo: string) => rows.filter(r => r.todo === todo).length;
  console.log(`Cần tạo metadata: ${count('init')} · Cần chấm: ${count('review')} · Chờ tạo mới: ${count('create')} · Đã xong (bỏ qua): ${count('done')} · Không làm được: ${count('blocked')}`);
  let last = '';
  for (const r of rows) {
    if (r.channelId !== last) console.log(`\n### ${r.channelId} | ${r.channel} | ${r.niche} | ${r.language}`);
    last = String(r.channelId);
    console.log(`[${r.todo}] ${r.videoId} | ${r.status} | ${r.title || '(chưa có title)'}${r.thumbnail ? '' : ' | CHƯA CÓ BÌA'}${r.reason ? ` | ${r.reason}` : ''}`);
  }
}

// ---------- info ----------
async function info(args: string[]) {
  const { channel, videoId, dir, metaFile } = requireTarget(args);
  const meta = readMeta(metaFile);
  if (!meta) throw new Error('video-meta.json thiếu hoặc hỏng');
  const status = videoPrepareRepository.read(channel.id).find(item => item.videoId.trim() === videoId)?.status ?? null;
  const transcript = transcriptFile(dir);
  const flow = await drawFlow(channel);
  const cluster = nicheCluster(channel.niche);
  const candidates = readMeta(path.join(dir, 'thumbnail-candidates/candidates.json'));
  console.log(
    JSON.stringify(
      {
        video: { videoId, status, dir: rel(dir), sourceTitle: meta.source_title ?? null, detectedNiche: meta.detected_niche ?? null, clusterFormat: meta.cluster_format ?? null },
        channel: {
          id: channel.id, name: channel.name, niche: nicheLabel(channel.niche), language: channel.language,
          /** The channel's own cluster; null = decide it from the transcript with `npm run -s trends -- clusters`. */
          cluster: cluster ? `K${cluster}` : null,
          promptFiles: channelPromptFiles(channel),
          /** false = generic fallback prompt: copy the look of the channel's own thumbnails instead. */
          promptIsOwn: hasNicheMetadataPrompt(channel.language, channel.niche),
          /** Newest other thumbnails of the channel, to keep one look and to see repeated title moulds. */
          siblings: siblingVideos(channel, videoId),
          /**
           * Real Studio CTR of the channel's published videos, best first (jp-psy-studio → ctr-log.csv).
           * Read before scoring or drawing: the look and title mould of the top rows is the channel's proven
           * template (B3, T2); a new pair must stay inside it. Empty = no Studio data yet.
           */
          measured: measuredVideos(channel),
        },
        files: {
          transcript: transcript ? rel(transcript) : null,
          transcriptChars: Array.from(transcriptText(dir).replace(/\s/g, '')).length,
          thumbnail: findThumbnailPath(dir) ? rel(findThumbnailPath(dir)!) : null,
          drawn: fs.existsSync(path.join(dir, WORK_DIRNAME, DRAWN_FILENAME)) ? rel(path.join(dir, WORK_DIRNAME, DRAWN_FILENAME)) : null,
        },
        current: {
          title: metadataOf(meta).title ?? '',
          alternativeTitles: meta.alternative_titles ?? [],
          hookLines: candidates?.candidates?.find((c: any) => c.file && c.file === candidates.selectedFile)?.hookLines ?? storedHookLines(meta.thumbnail),
          description: metadataOf(meta).description ?? '',
          tags: metadataOf(meta).tags ?? [],
          thumbnailPlan: meta.thumbnail ?? null,
          imagePrompt: meta.image_generation_prompt ?? null,
        },
        draw: { flow: flow.flow, references: flow.references.map(rel), note: flow.note ?? null },
        state: stateOf(meta),
      },
      null,
      2,
    ),
  );
}

// ---------- review ----------
function readInput<T extends z.ZodTypeAny>(file: string | undefined, schema: T): z.infer<T> {
  if (!file) throw new Error('Thiếu file JSON');
  const parsed = schema.safeParse(JSON.parse(fs.readFileSync(file, 'utf-8')));
  if (!parsed.success) throw new Error(`${file}:\n${parsed.error.issues.map(i => `- ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  return parsed.data;
}

/** Re-reads the file right before writing so nothing the app changed meanwhile is lost. */
function patchMeta(metaFile: string, change: (meta: Meta) => void) {
  const meta = readMeta(metaFile);
  if (!meta) throw new Error('video-meta.json thiếu hoặc hỏng');
  change(meta);
  writeJson(metaFile, meta);
}

function review(args: string[]) {
  const input = readInput(args.at(-1), reviewSchema);
  const { videoId, dir, metaFile } = requireTarget(args.slice(0, -1));
  const parts = score(input);
  const status: CtrStatus = parts.total >= PASS_SCORE ? 'passed' : 'needs_work';
  patchMeta(metaFile, meta => {
    const state: CtrReview = {
      skill: 'jp-psy-ctr', status, reviewedAt: new Date().toISOString(),
      cluster: input.cluster, clusterReason: input.clusterReason, topic: input.topic,
      score: parts.total, parts, scores: input.scores, blocking: input.blocking, issues: input.issues,
      title: metadataOf(meta).title ?? '', thumbnailHash: hashFile(findThumbnailPath(dir)),
    };
    meta.ctr_review = state;
  });
  console.log(`${videoId}: ${parts.total}/10 (cặp ${parts.pair}/40, title ${parts.title}/30, bìa ${parts.thumbnail}/30)${input.blocking.length ? ` · LỖI CHẶN: ${input.blocking.join('; ')}` : ''}`);
  console.log(status === 'passed' ? `Đạt ${PASS_SCORE}: giữ nguyên, đã đánh dấu xong.` : `Dưới ${PASS_SCORE}: cần tạo title + bìa mới.`);
}

// ---------- draw ----------
async function serverGet(url: string): Promise<any | null> {
  try {
    const response = await fetch(`http://localhost:${env.port}/api/v1${url}`, { signal: AbortSignal.timeout(5000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/** Title problems the meta pipeline would reject, plus promises / stats for prompts without sample titles. */
function titleProblems(proposal: z.infer<typeof proposalSchema>, meta: Meta, dir: string, cluster: string | undefined): string[] {
  const transcript = transcriptText(dir);
  const file = cluster && cluster !== 'off' ? path.join(paths.dataDir, `prompts/ja/metadata_tlnb_${cluster.toLowerCase()}/step-1.js`) : '';
  const prompt = file && fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
  const reasons = checkTitleGuards({
    title: proposal.title, prompt, transcript, hookLines: proposal.hookLines,
    sourceTitle: meta.source_title ?? '', alternativeTitles: proposal.alternativeTitles,
  }).reasons;
  if (!prompt) {
    for (const word of findUnsupportedPromises(proposal.title, transcript)) reasons.push(`title dùng 「${word}」 nhưng transcript không nói vậy`);
    for (const stat of findUnsupportedStats(proposal.title, transcript)) reasons.push(`title nêu 「${stat}」 nhưng transcript không có con số đó`);
  }
  for (const line of proposal.hookLines) {
    if (!proposal.thumbnailPrompt.includes(line)) reasons.push(`thumbnailPrompt không chứa nguyên văn dòng bìa 「${line}」`);
  }
  return reasons;
}

async function draw(args: string[], flags: Record<string, string>) {
  const proposal = readInput(args.at(-1), proposalSchema);
  const { channel, dir, metaFile } = requireTarget(args.slice(0, -1));
  const meta = readMeta(metaFile)!;
  const problems = titleProblems(proposal, meta, dir, stateOf(meta)?.cluster);
  if (problems.length) throw new Error(`Sửa trước khi vẽ:\n- ${problems.join('\n- ')}`);
  const flow = await drawFlow(channel);
  const references = flow.flow === 'celebrity' && channel.celebrityId ? [pickRandomCelebrityImagePath(channel.celebrityId)] : flow.references;
  if (flow.flow === 'celebrity' && references.length === 0) throw new Error(flow.note);

  const queue = await serverGet('/task-queue?view=summary');
  const busy = (queue?.items ?? []).filter((item: any) => ['queued', 'running', 'pending', 'processing'].includes(String(item.status)));
  if (busy.length && !flags.force) throw new Error(`Server đang có ${busy.length} việc trong hàng chờ, trình duyệt vẽ có thể đang bận. Đợi xong rồi chạy lại.`);

  const workDir = path.join(dir, WORK_DIRNAME);
  fs.mkdirSync(workDir, { recursive: true });
  const target = path.join(workDir, DRAWN_FILENAME);
  if (fs.existsSync(target)) fs.renameSync(target, path.join(workDir, `thumbnail-${Date.now()}.jpg`));
  console.log(`Vẽ bìa (${flow.flow}${references.length ? `, ${references.length} ảnh tham chiếu` : ''}) → ${rel(target)}`);
  const { runBrowserImageGeneration } = await import('../modules/video-production/shared/thumbnail/hero-image.js');
  const { removeGeminiWatermarkIfEnabled } = await import('../modules/video-production/shared/thumbnail/remove-gemini-watermark.js');
  const result = await runBrowserImageGeneration(proposal.thumbnailPrompt, workDir, {
    fileName: DRAWN_FILENAME,
    ...(references.length ? { referenceImagePaths: references } : {}),
  });
  await removeGeminiWatermarkIfEnabled(result.imagePath);
  if (path.resolve(result.imagePath) !== path.resolve(target)) fs.copyFileSync(result.imagePath, target);
  writeJson(path.join(workDir, 'drawn.json'), { hookLines: proposal.hookLines, title: proposal.title, prompt: proposal.thumbnailPrompt, hash: hashFile(target), at: new Date().toISOString() });
  console.log(`Xong: ${rel(target)}. Mở ảnh này để chấm lại trước khi apply.`);
}

// ---------- apply ----------
// VOICEVOX credit (「VOICEVOX:青山龍星」): same rules as the app's metadata and upload steps.
const voicevoxCredit = resolveVoicevoxCredit;
const withCredit = withVoicevoxCredit;

const preparingStatus =(channelId: string, videoId: string) =>
  videoPrepareRepository.read(channelId).find(item => item.videoId.trim() === videoId)?.status === 'Preparing';

/**
 * The content API only edits Prepared / Created videos, but a Preparing video becomes Prepared only once it has a
 * title and a thumbnail. Writes the same three fields and the image the API would, so the app promotes it the next
 * time it lists the channel's videos (promotePreparingVideo). The caller has already backed up the old files.
 */
function writePreparingContent(channelId: string, videoId: string, input: { title: string; description: string; tags: string[] }, image: string): string {
  const dir = resolveYoutubeChannelVideoDir(channelId, videoId);
  if (!dir) throw new Error(`Không có thư mục của video ${videoId}`);
  patchMeta(path.join(dir, 'video-meta.json'), meta => {
    const target = meta.result?.metadata ?? (meta.metadata ??= {});
    target.title = input.title.trim();
    target.description = input.description;
    target.tags = input.tags;
  });
  for (const name of fs.readdirSync(dir)) if (/^thumbnail\.(png|webp|jpeg)$/i.test(name)) fs.rmSync(path.join(dir, name));
  fs.copyFileSync(image, path.join(dir, 'thumbnail.jpg'));
  videoPrepareRepository.updateTitle(channelId, videoId, input.title.trim());
  return 'ghi thẳng vào thư mục (video Đang chuẩn bị: app chỉ sửa qua API khi đã Đã chuẩn bị)';
}

async function updateContent(channelId: string, videoId: string, input: { title: string; description: string; tags: string[] }, image: string): Promise<string> {
  const form = new FormData();
  form.set('title', input.title);
  form.set('description', input.description);
  form.set('tags', JSON.stringify(input.tags));
  form.set('thumbnail', new File([fs.readFileSync(image)], 'thumbnail.jpg', { type: 'image/jpeg' }));
  const url = `http://localhost:${env.port}/api/v1/youtube-channels/${channelId}/videos/${videoId}/content`;
  try {
    const response = await fetch(url, { method: 'PATCH', body: form });
    if (response.status === 409 && preparingStatus(channelId, videoId)) return writePreparingContent(channelId, videoId, input, image);
    if (!response.ok) throw new Error(`Server trả ${response.status}: ${(await response.text()).slice(0, 400)}`);
    return 'server';
  } catch (err) {
    if (preparingStatus(channelId, videoId) && (err as { cause?: { code?: string } }).cause?.code === 'ECONNREFUSED') {
      return writePreparingContent(channelId, videoId, input, image);
    }
    if ((err as { cause?: { code?: string } }).cause?.code !== 'ECONNREFUSED') throw err;
    const { youtubeVideoContentService } = await import('../modules/youtube-channels/youtube-video-content.service.js');
    await youtubeVideoContentService.update(channelId, videoId, input, { buffer: fs.readFileSync(image), contentType: 'image/jpeg' });
    return 'ghi thẳng (server tắt)';
  }
}

function deepMerge(target: any, patch: any): any {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const base = target && typeof target === 'object' && !Array.isArray(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) base[key] = deepMerge(base[key], value);
  return base;
}

async function apply(args: string[]) {
  const proposal = readInput(args.at(-1), proposalSchema);
  const { channel, videoId, dir, metaFile } = requireTarget(args.slice(0, -1));
  const meta = readMeta(metaFile)!;
  const state = stateOf(meta);
  if (!state) throw new Error('Chưa có điểm của cặp cũ: chạy `review` trước.');
  if (DONE.includes(state.status)) throw new Error(`Video đã xong (${state.status}). Muốn làm lại thì chấm lại bằng \`review\`.`);
  if (changedSince(state, metadataOf(meta).title ?? '', findThumbnailPath(dir))) throw new Error('Title hoặc bìa đã đổi sau khi chấm: chạy lại `review`.');
  if (!proposal.after) throw new Error('Thiếu "after": điểm của cặp mới, chấm trên ảnh vừa vẽ.');
  const status = videoPrepareRepository.read(channel.id).find(item => item.videoId.trim() === videoId)?.status;
  if (status !== 'Created' && status !== 'Prepared' && status !== 'Preparing') throw new Error(`Video ở trạng thái ${status}: không sửa.`);

  const problems = titleProblems(proposal, meta, dir, proposal.after.cluster);
  if (problems.length) throw new Error(`Không áp dụng:\n- ${problems.join('\n- ')}`);
  const workDir = path.join(dir, WORK_DIRNAME);
  const image = path.join(workDir, DRAWN_FILENAME);
  const drawn = readMeta(path.join(workDir, 'drawn.json'));
  if (!fs.existsSync(image) || !drawn || drawn.hash !== hashFile(image)) throw new Error('Chưa có ảnh mới từ `draw` (hoặc ảnh đã bị đổi).');
  if (drawn.title !== proposal.title || drawn.hookLines.join('|') !== proposal.hookLines.join('|')) throw new Error('Ảnh đã vẽ thuộc về title / chữ bìa khác: chạy lại `draw`.');

  const after = score(proposal.after);
  if (after.total < PASS_SCORE) throw new Error(`Cặp mới mới đạt ${after.total}/10, dưới ${PASS_SCORE}: viết hoặc vẽ lại, không thay bản cũ.`);
  if (after.total <= state.score) throw new Error(`Cặp mới ${after.total}/10 không hơn bản cũ ${state.score}/10.`);

  const backup = path.join(dir, BACKUP_DIRNAME, new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(backup, { recursive: true });
  fs.copyFileSync(metaFile, path.join(backup, 'video-meta.json'));
  const oldThumb = findThumbnailPath(dir);
  if (oldThumb) fs.copyFileSync(oldThumb, path.join(backup, path.basename(oldThumb)));

  const old = metadataOf(meta);
  const credit = await voicevoxCredit(dir);
  if (readMeta(path.join(dir, 'remake-state.json'))?.voice && !credit) console.warn('CHÚ Ý: video đọc bằng VOICEVOX nhưng không tra được tên giọng; thêm tay dòng VOICEVOX:<tên> vào mô tả.');
  const via = await updateContent(channel.id, videoId, {
    title: proposal.title,
    description: withCredit(proposal.description ?? old.description ?? '', credit),
    tags: proposal.tags ?? old.tags ?? [],
  }, image);

  patchMeta(metaFile, current => {
    if (proposal.alternativeTitles.length) current.alternative_titles = proposal.alternativeTitles;
    current.image_generation_prompt = proposal.thumbnailPrompt;
    current.thumbnail = deepMerge(current.thumbnail ?? {}, { ...proposal.thumbnailPatch, prompt: proposal.thumbnailPrompt });
    current.ctr_review = {
      ...state,
      status: 'improved',
      after: {
        score: after.total, parts: after, scores: proposal.after!.scores, title: proposal.title, hookLines: proposal.hookLines,
        hook: proposal.hook, appliedAt: new Date().toISOString(), thumbnailHash: hashFile(findThumbnailPath(dir)), backup: rel(backup),
      },
    } satisfies CtrReview;
  });

  // Mascot videos list their candidates in the app: add the new image so the popup shows what is in use.
  const candidatesFile = path.join(dir, 'thumbnail-candidates/candidates.json');
  const candidates = readMeta(candidatesFile);
  if (candidates && Array.isArray(candidates.candidates)) {
    const used = candidates.candidates.map((c: any) => Number(/^candidate-(\d+)\.jpg$/.exec(c.file ?? '')?.[1] ?? 0));
    const file = `candidate-${Math.max(0, ...used) + 1}.jpg`;
    fs.copyFileSync(findThumbnailPath(dir)!, path.join(dir, 'thumbnail-candidates', file));
    candidates.candidates.push({ angle: 'jp-psy-ctr', hookLines: proposal.hookLines, emphasis: proposal.emphasis, mascotPose: '', composition: '', prompt: proposal.thumbnailPrompt, file });
    candidates.selectedFile = file;
    writeJson(candidatesFile, candidates);
  }
  fs.rmSync(workDir, { recursive: true, force: true });
  console.log(`${videoId}: ${state.score} → ${after.total}/10, đã thay title + bìa (${via}). Bản cũ: ${rel(backup)}`);
}

/** Gives up on this video after the allowed tries: the old pair stays and the video counts as done. */
function keep(args: string[], flags: Record<string, string>) {
  const { videoId, metaFile } = requireTarget(args);
  if (!flags.reason) throw new Error('Cần --reason "vì sao giữ bản cũ"');
  patchMeta(metaFile, meta => {
    const state = stateOf(meta);
    if (!state) throw new Error('Chưa chấm video này.');
    meta.ctr_review = { ...state, status: 'kept', keptReason: flags.reason } satisfies CtrReview;
  });
  console.log(`${videoId}: giữ bản cũ, đã đánh dấu xong.`);
}

async function restore(args: string[]) {
  const { channel, videoId, dir, metaFile } = requireTarget(args);
  const root = path.join(dir, BACKUP_DIRNAME);
  const last = fs.existsSync(root) ? fs.readdirSync(root).filter(name => !name.endsWith('-credit')).sort().at(-1) : undefined;
  if (!last) throw new Error('Video này không có bản sao lưu.');
  const from = path.join(root, last);
  const oldMeta = readMeta(path.join(from, 'video-meta.json'))!;
  const image = findThumbnailPath(from);
  const old = metadataOf(oldMeta);
  if (image) await updateContent(channel.id, videoId, { title: old.title, description: old.description ?? '', tags: old.tags ?? [] }, image);
  else {
    const current = findThumbnailPath(dir);
    if (current) fs.rmSync(current);
    videoPrepareRepository.updateTitle(channel.id, videoId, old.title);
  }
  // The content update re-encodes the image: put the exact original bytes back.
  if (image && path.extname(image) === '.jpg') fs.copyFileSync(image, path.join(dir, 'thumbnail.jpg'));
  delete oldMeta.ctr_review;
  writeJson(metaFile, oldMeta);
  console.log(`${videoId}: đã khôi phục bản ${last} và xoá trạng thái (lần quét sau sẽ chấm lại).`);
}

// ---------- credit ----------
/** Adds the VOICEVOX credit to a video's description without touching its title or thumbnail. */
async function credit(args: string[]) {
  const { channel, videoId, dir, metaFile } = requireTarget(args);
  const meta = readMeta(metaFile);
  if (!meta) throw new Error('video-meta.json thiếu hoặc hỏng');
  const line = await voicevoxCredit(dir);
  if (!line) throw new Error('Không thấy giọng VOICEVOX của video (remake-state.json không có voice, hoặc không tra được tên).');
  const old = metadataOf(meta);
  const description = withCredit(old.description ?? '', line);
  if (description === (old.description ?? '')) return console.log(`${videoId}: mô tả đã có 「${line}」.`);
  const image = findThumbnailPath(dir);
  if (!image) throw new Error('Video chưa có bìa: thêm credit khi `apply` cặp mới.');
  const backup = path.join(dir, BACKUP_DIRNAME, `${new Date().toISOString().replace(/[:.]/g, '-')}-credit`);
  fs.mkdirSync(backup, { recursive: true });
  fs.copyFileSync(metaFile, path.join(backup, 'video-meta.json'));
  fs.copyFileSync(image, path.join(backup, path.basename(image)));
  const via = await updateContent(channel.id, videoId, { title: old.title, description, tags: old.tags ?? [] }, image);
  // The content API re-encodes the image: keep the exact bytes.
  if (path.extname(image) === '.jpg') fs.copyFileSync(path.join(backup, path.basename(image)), path.join(dir, 'thumbnail.jpg'));
  console.log(`${videoId}: đã thêm 「${line}」 vào cuối mô tả (${via}). Bản cũ: ${rel(backup)}`);
}

// ---------- init ----------
/**
 * A video narrated by hand (voice tab) never ran the pipeline's metadata step, so it has no video-meta.json and
 * nothing for the app or this CLI to edit. Writes the smallest file the app accepts ({ metadata }), titled with
 * the script's working title, so the normal review → draw → apply loop can build the real pair.
 */
function init(args: string[]) {
  const { channel, videoId, dir, metaFile } = requireTarget(args);
  if (readMeta(metaFile)) throw new Error('Video đã có video-meta.json: dùng `review` như thường.');
  const status = videoPrepareRepository.read(channel.id).find(item => item.videoId.trim() === videoId)?.status;
  if (status !== 'Created' && status !== 'Prepared' && status !== 'Preparing') throw new Error(`Video ở trạng thái ${status}: không sửa.`);
  if (!transcriptFile(dir)) throw new Error('Video chưa có transcript (chưa đọc giọng): chưa làm metadata được.');
  const remakeDir = path.join(dir, 'remake');
  const remake = fs.existsSync(remakeDir)
    ? fs.readdirSync(remakeDir).filter(name => /^remake-.*\.json$/.test(name)).sort().map(name => readMeta(path.join(remakeDir, name))).at(-1)
    : null;
  const skillMeta = remake?.skillMeta ?? remake?.outline ?? {};
  const prepareTitle = videoPrepareRepository.read(channel.id).find(item => item.videoId.trim() === videoId)?.title ?? '';
  const title = String(skillMeta.title || prepareTitle || '').trim();
  if (!title) throw new Error('Không tìm thấy title tạm (video-prepare.json hay remake/*.json).');
  const source = readMeta(path.join(dir, 'source', 'info.json'));
  writeJson(metaFile, {
    videoId,
    language: channel.language,
    ...(source?.title ? { source_title: source.title } : {}),
    detected_niche: typeof skillMeta.topic === 'string' ? skillMeta.topic : '',
    metadata: { title, description: '', tags: [] },
    created_by: 'jp-psy-ctr init',
  });
  console.log(`${videoId}: đã tạo video-meta.json với title tạm 「${title}」 (chưa có mô tả, tag, bìa). Chạy \`info\` rồi \`review\`.`);
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  const { flags, rest } = parseArgs(argv);
  if (command === 'scan') return scan(rest, flags);
  if (command === 'init') return init(rest);
  if (command === 'credit') return credit(rest);
  if (command === 'info') return info(rest);
  if (command === 'review') return review(rest);
  if (command === 'draw') return draw(rest, flags);
  if (command === 'apply') return apply(rest);
  if (command === 'keep') return keep(rest, flags);
  if (command === 'restore') return restore(rest);
  throw new Error('Usage: ctr scan [channel|video] | info <video> | review <video> <json> | draw <video> <json> | apply <video> <json> | keep <video> --reason "..." | restore <video>');
}

main().then(
  () => process.exit(0),
  err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
