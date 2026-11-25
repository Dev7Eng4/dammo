/**
 * Motion skill (jp-psy-motion): Claude reads the narration and looks at the scene images, picks the moments
 * worth turning into a Flow (Veo) clip and writes each one's motion; this CLI gives it the material, checks the
 * plan, writes the motion into the video's scenes and asks the running server to make the clips (the server
 * owns the Flow browser profiles). Clips replace the still image the next time the video is assembled.
 *
 * A clip fills a 6–10 s window: one scene, or a scene plus the next ones of the same moment (`span`, the
 * covered scenes' images are left out while the clip exists). Each clip is made exactly as long as its
 * window (Flow's Length slider, 3–10 s). Clips go in the first part of the video (`--until`, default 50%),
 * where viewers are still deciding to stay.
 *
 *   npm run -s motion -- scan [channel|video] [--json] [--force]
 *   npm run -s motion -- info <video> [--until 50%]
 *   npm run -s motion -- sheet <video> [scene…] [--all] [--out <dir>]
 *   npm run -s motion -- check <video> [plan.json] [--max N] [--until 50%]
 *   npm run -s motion -- apply <video> [plan.json] [--max N] [--until 50%]
 *   npm run -s motion -- make <video> [scene…]
 *   npm run -s motion -- frames <video> [scene…] [--out <dir>]
 *   npm run -s motion -- drop <video> <scene…|all>
 *   npm run -s motion -- redo <video> <scene…>
 *
 * Not imported by main.ts: editing it never restarts the server.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { paths } from '../config/paths.js';
import { resolveFfmpegLocation } from '../infrastructure/ffmpeg/ffmpeg-location.js';
import { getMediaDurationSeconds } from '../infrastructure/ffmpeg/ffmpeg-probe.js';
import { srtTimestampToMs } from '../infrastructure/subtitle/srt-utils.js';
import { sceneClipLengthSec } from '../modules/video-production/shared/ai-video/ai-video-clip-span.js';
import { loadTranscriptCuesFromSrt } from '../modules/video-production/shared/ai-video/ai-video-transcript.js';
import { AI_SCENE_PROMPTS_FILENAME, AI_VIDEOS_DIRNAME, FLOW_CLIP_MAX_SEC, FLOW_CLIP_MIN_SEC } from '../modules/video-production/shared/ai-video/ai-video.constants.js';
import type { AiVideoScenePrompt, TranscriptCue } from '../modules/video-production/shared/ai-video/ai-video.types.js';
import { serverBusy } from './lib/channel-browser.js';
import {
  audioSpeed,
  chapterStarts,
  clock,
  fail,
  onScreen,
  PRODUCTION,
  r1,
  readJson,
  resolveScope,
  resolveVideo,
  serverRequest,
  serverUp,
  stamp,
  subtitlePath,
  type VideoRef,
  writeJson,
} from './lib/production-video.js';

// ---------- rules (seconds on screen, after audio speed) ----------
/** The hook: clips here matter most (viewers decide to stay in the first 30 seconds). */
const INTRO_SEC = 30;
/** A clip window in this range is seen long enough to notice the motion and fits one clip. */
const WINDOW_GOOD_MIN = 6;
const WINDOW_GOOD_MAX = FLOW_CLIP_MAX_SEC + 0.5;
/** Below this the picture changes before the motion is seen; above it the clip freezes over 1 s. */
const WINDOW_HARD_MIN = 4;
const WINDOW_HARD_MAX = FLOW_CLIP_MAX_SEC + 1;
/** At most this many scenes under one clip. */
const MAX_SPAN = 4;
/** Clips only in the first part of the video by default. */
const DEFAULT_UNTIL = 0.5;
/** Clips per video unless --max says otherwise: each clip costs Flow credits. */
const DEFAULT_MAX = 15;
/** Between the hook and the cut-off, one clip every this many seconds is the target rhythm. */
const BODY_EVERY_SEC = 45;
/** After the hook, clips closer than this feel like one effect repeated. */
const MIN_GAP_SEC = 20;
/** After the hook, a stretch this long without a clip is a missed chance when it has candidates. */
const MAX_GAP_SEC = 90;
/** Flow charges about one credit per second of clip (5 s = 5 credits at 360p). */
const CREDITS_PER_SEC = 1;

/** The app decides the camera (still, or a tiny push-in on wide shots); text always comes out garbled. */
const MOTION_FORBIDDEN = /\b(text|caption|subtitles?|letters?|logo|zoom(?:s|ing)?|pan(?:s|ning)?|dolly|orbit(?:s|ing)?|tracking shot|camera)\b/i;
/** Big or fast moves are where Veo melts faces and bodies. */
const MOTION_RISKY = /\b(transform\w*|morph\w*|turns? into|appears?|new (?:person|character)|runs?|running|jumps?|jumping|danc\w+|fast|quickly|sudden\w*|explod\w*|spins?|spinning)\b/i;
/** Fine hand work comes out with extra or melted fingers. */
const MOTION_HANDS = /\b(fingers?|typing|types|writes?|writing|knit\w*|counting|sews?|sewing)\b/i;
/** Image content Veo handles badly. */
const IMAGE_RISKY: Array<[RegExp, string]> = [
  [/\b(text|sign|signboard|letters?|words?|newspaper|book cover|calendar|label)\b/i, 'ảnh có chữ / biển / giấy tờ: chữ sẽ nhoè khi chuyển động'],
  [/\b(crowd|group of|many people|audience|several people|family of)\b/i, 'ảnh đông người: Veo dễ làm méo mặt người phụ'],
  [/\bclose-?up of (?:a |the |her |his )?hands?\b/i, 'cận tay: ngón tay dễ méo'],
];
/** "no text", "without writing", "flags-free" in a channel's style rules are not text in the picture. */
const NEGATED_TEXT = /\b(?:no|without|free of)\s+(?:\w+\s+){0,3}?(?:text|letters?|words?|writing|labels?|signs?|logos?)\b|\b\w+-free\b/gi;
/** Narration that opens a list item (第3位, その2, 二つ目…): a new point, never covered by the clip before it. */
const LIST_ITEM = /^[\s「『]*(?:第[0-9０-９一二三四五六七八九十]+位|その[0-9０-９一二三四五六七八九十]|[0-9０-９一二三四五六七八九十]+つ目|まず|最後に)/;

const STATE_FILE = 'motion-skill.json';
const BACKUP_DIR = 'motion-backup';
const WORK_ROOT = path.join(paths.dataDir, 'motion-skill');
const FONT_DIR = path.join(paths.dataDir, 'assets', 'fonts');
const FONT_FILE = 'NotoSerifJP-SemiBold.ttf';
const POLL_MS = 15_000;
const MAKE_TIMEOUT_MS = 4 * 60 * 60 * 1000;

const argv = process.argv.slice(2);
const has = (name: string) => argv.includes(`--${name}`);
const flag = (name: string) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
};
const FLAGS_WITH_VALUE = new Set(['--max', '--out', '--until']);
// A video id may start with one "-", so only "--" marks a flag.
const positional = argv.filter((arg, index) => !arg.startsWith('--') && !FLAGS_WITH_VALUE.has(argv[index - 1] ?? ''));
const [command, target, ...rest] = positional;
const slashes = (p: string) => p.replaceAll('\\', '/');

// ---------- scenes ----------
interface SceneRow {
  /** 1-based, as the plan and the app's scene list number them. */
  n: number;
  scene: AiVideoScenePrompt;
  startSec: number;
  shownSec: number;
  isTitle: boolean;
  image: string | null;
  clip: string | null;
  /** Narration while the scene is on screen. */
  said: string;
  /** Chapter heading when the scene opens a chapter. */
  chapter?: string;
  /** Scene opens a chapter or a list item: a clip may start here but never cover it from before. */
  boundary: boolean;
}

interface Video {
  ref: VideoRef;
  file: string;
  data: any;
  scenes: AiVideoScenePrompt[];
  rows: SceneRow[];
  totalSec: number;
  chapters: number;
}

function existing(dir: string, relative: string | undefined): string | null {
  if (!relative?.trim()) return null;
  const file = path.isAbsolute(relative) ? relative : path.resolve(dir, relative);
  return fs.existsSync(file) ? file : null;
}

/** Narration said while a scene is on screen (subtitle time, before audio speed). */
function narration(scene: AiVideoScenePrompt, next: AiVideoScenePrompt | undefined, cues: TranscriptCue[]): string {
  const from = srtTimestampToMs(scene.startTime);
  const to = next ? srtTimestampToMs(next.startTime) : srtTimestampToMs(scene.endTime);
  return cues
    .filter(cue => srtTimestampToMs(cue.endTime) > from && srtTimestampToMs(cue.startTime) < to)
    .map(cue => cue.text.replace(/\s+/g, ' ').trim())
    .join(' ');
}

async function loadVideo(ref: VideoRef): Promise<Video> {
  const file = path.join(ref.dir, AI_SCENE_PROMPTS_FILENAME);
  const data = readJson(file);
  const scenes: AiVideoScenePrompt[] = Array.isArray(data?.scenes) ? data.scenes : [];
  const subtitle = subtitlePath(ref.dir);
  const cues = subtitle ? await loadTranscriptCuesFromSrt(subtitle) : [];
  const timed = onScreen(scenes, audioSpeed(ref));

  // Chapter heading on the first scene that starts at or after the chapter's first cue.
  const headingAt = new Map<number, string>();
  for (const [cueIndex, heading] of chapterStarts(ref.dir, cues)) {
    const cueStart = srtTimestampToMs(cues[cueIndex]!.startTime);
    const index = scenes.findIndex(scene => srtTimestampToMs(scene.startTime) >= cueStart - 500);
    if (index !== -1 && !headingAt.has(index)) headingAt.set(index, heading);
  }

  const rows = scenes.map((scene, index): SceneRow => {
    const isTitle = scene.type === 'title';
    const said = narration(scene, scenes[index + 1], cues);
    const chapter = headingAt.get(index);
    return {
      n: index + 1,
      scene,
      startSec: timed[index]!.startSec,
      shownSec: timed[index]!.shownSec,
      isTitle,
      image: isTitle ? null : existing(ref.dir, scene.path),
      clip: isTitle ? null : existing(ref.dir, scene.videoPath),
      said,
      ...(chapter ? { chapter } : {}),
      boundary: Boolean(chapter) || isTitle || LIST_ITEM.test(said),
    };
  });
  const last = rows.at(-1);
  return { ref, file, data, scenes, rows, totalSec: last ? last.startSec + last.shownSec : 0, chapters: headingAt.size };
}

/** Seconds a clip starting at scene `n` and covering `span` scenes stays on screen. */
function windowSec(rows: SceneRow[], n: number, span: number): number {
  return rows.slice(n - 1, n - 1 + span).reduce((sum, row) => sum + row.shownSec, 0);
}

/** Why scene `n` cannot cover the next `span - 1` scenes, or null when it can. */
function spanProblem(rows: SceneRow[], n: number, span: number): string | null {
  if (n - 1 + span > rows.length) return `chỉ còn ${rows.length - n + 1} cảnh tới cuối video`;
  for (const row of rows.slice(n, n - 1 + span)) {
    if (row.isTitle) return `cảnh ${row.n} là thẻ tiêu đề`;
    if (row.boundary) return `cảnh ${row.n} mở ${row.chapter ? 'chương' : 'mục'} mới`;
  }
  return null;
}

/** The smallest span (1…MAX_SPAN) that brings scene `n` into the good window, or null. */
function bestSpan(rows: SceneRow[], n: number): number | null {
  const row = rows[n - 1]!;
  if (row.isTitle || !row.image) return null;
  for (let span = 1; span <= MAX_SPAN; span += 1) {
    if (span > 1 && spanProblem(rows, n, span)) return null;
    const sec = windowSec(rows, n, span);
    if (sec > WINDOW_GOOD_MAX) return null;
    if (sec >= WINDOW_GOOD_MIN) return span;
  }
  return null;
}

/** Cut-off for clips: --until 50% (share of the video) or --until 360 (seconds). */
function untilSec(totalSec: number): number {
  const raw = flag('until');
  if (!raw) return totalSec * DEFAULT_UNTIL;
  const value = Number(raw.replace('%', ''));
  if (!Number.isFinite(value) || value <= 0) return fail('--until phải là phần trăm (50%) hoặc số giây (360).');
  return raw.endsWith('%') ? (totalSec * Math.min(100, value)) / 100 : Math.min(totalSec, value);
}

/** Clips the rhythm asks for: up to 3 in the hook, then one every BODY_EVERY_SEC until the cut-off. */
function suggestedClips(video: Video, until: number, max: number): { intro: number; body: number; total: number } {
  const intro = Math.min(3, video.rows.filter(row => row.startSec < INTRO_SEC && bestSpan(video.rows, row.n)).length);
  const body = Math.max(0, Math.min(max - intro, Math.round(Math.max(0, until - INTRO_SEC) / BODY_EVERY_SEC)));
  return { intro, body, total: intro + body };
}

/** Lengths of the text every prompt starts and ends with (cut back to a word), when worth hiding. */
function sharedEnds(prompts: string[]): [number, number] {
  if (prompts.length < 3) return [0, 0];
  const common = (texts: string[]) => {
    let length = texts[0]!.length;
    for (const text of texts) {
      let i = 0;
      while (i < length && i < text.length && text[i] === texts[0]![i]) i += 1;
      length = i;
    }
    const cut = texts[0]!.lastIndexOf(' ', length);
    return length === texts[0]!.length ? length : Math.max(0, cut);
  };
  const reversed = (text: string) => [...text].reverse().join('');
  const prefix = common(prompts);
  const suffix = common(prompts.map(reversed));
  return [prefix >= 40 ? prefix : 0, suffix >= 40 ? suffix : 0];
}

function workDir(ref: VideoRef) {
  return path.join(WORK_ROOT, ref.channel.id, ref.videoId);
}

function readState(ref: VideoRef): any {
  return readJson(path.join(ref.dir, STATE_FILE));
}

function writeState(ref: VideoRef, state: any) {
  writeJson(path.join(ref.dir, STATE_FILE), state);
}

function saveScenes(video: Video) {
  writeJson(video.file, { ...video.data, scenes: video.scenes });
}

// ---------- plan ----------
interface PlanClip {
  scene: number;
  span?: number;
  why?: string;
  motion?: string;
}

function loadPlan(ref: VideoRef, file: string | undefined): PlanClip[] {
  const planFile = file ? path.resolve(file) : path.join(workDir(ref), 'plan.json');
  if (!fs.existsSync(planFile)) fail(`Chưa có kế hoạch: ${planFile}`);
  const data = readJson(planFile);
  if (!data) fail(`Không đọc được kế hoạch (JSON hỏng?): ${planFile}`);
  const list = Array.isArray(data) ? data : data.clips;
  if (!Array.isArray(list)) fail(`Kế hoạch không có "clips": ${planFile}`);
  return list;
}

interface PlannedClip {
  scene: number;
  span: number;
  why: string;
  motion: string;
  startSec: number;
  windowSec: number;
  lengthSec: number;
}

interface CheckResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  clips: PlannedClip[];
  credits: number;
}

function checkPlan(plan: PlanClip[], video: Video, max: number, until: number, rejected: number[]): CheckResult {
  const { rows } = video;
  const errors: string[] = [];
  const warnings: string[] = [];
  const covered = new Map<number, number>();
  const clips: PlannedClip[] = [];

  for (const [index, clip] of plan.entries()) {
    const span = clip.span ?? 1;
    const label = `clip ${index + 1} (cảnh ${clip.scene}${span > 1 ? `–${clip.scene + span - 1}` : ''})`;
    const row = Number.isInteger(clip.scene) ? rows[clip.scene - 1] : undefined;
    if (!row) {
      errors.push(`${label}: không có cảnh số này (video có ${rows.length} cảnh)`);
      continue;
    }
    if (!Number.isInteger(span) || span < 1 || span > MAX_SPAN) {
      errors.push(`${label}: "span" phải là số nguyên 1–${MAX_SPAN}`);
      continue;
    }
    for (let n = clip.scene; n < clip.scene + span; n += 1) {
      const owner = covered.get(n);
      if (owner !== undefined) errors.push(`${label}: cảnh ${n} đã thuộc clip ${owner}`);
      covered.set(n, index + 1);
    }
    if (row.isTitle) errors.push(`${label}: thẻ tiêu đề, không làm clip`);
    if (!row.image) errors.push(`${label}: cảnh chưa có ảnh, Flow cần ảnh làm khung đầu`);
    const problem = span > 1 ? spanProblem(rows, clip.scene, span) : null;
    if (problem) errors.push(`${label}: không gộp được vì ${problem}`);
    if (row.startSec >= until) errors.push(`${label}: bắt đầu ${clock(row.startSec)}, sau mốc ${clock(until)} (dùng --until nếu người dùng muốn clip ở phần sau)`);

    const sec = windowSec(rows, clip.scene, span);
    const fix = bestSpan(rows, clip.scene);
    const hint = fix && fix !== span ? ` (gộp "span": ${fix} thì được ${r1(windowSec(rows, clip.scene, fix))}s)` : '';
    if (sec < WINDOW_HARD_MIN) errors.push(`${label}: chỉ hiện ${r1(sec)}s, chưa kịp thấy chuyển động đã sang hình khác${hint}`);
    else if (sec > WINDOW_HARD_MAX) errors.push(`${label}: hiện ${r1(sec)}s, clip tối đa ${FLOW_CLIP_MAX_SEC}s sẽ đứng hình ${r1(sec - FLOW_CLIP_MAX_SEC)}s ở khung cuối`);
    else if (sec < WINDOW_GOOD_MIN) warnings.push(`${label}: hiện ${r1(sec)}s, ngắn hơn ${WINDOW_GOOD_MIN}s; chỉ ổn khi cử động xảy ra ngay${hint}`);
    else if (sec > WINDOW_GOOD_MAX) warnings.push(`${label}: hiện ${r1(sec)}s, clip ${FLOW_CLIP_MAX_SEC}s đứng hình ${r1(sec - FLOW_CLIP_MAX_SEC)}s cuối`);
    if (rejected.includes(clip.scene)) warnings.push(`${label}: lần trước clip cảnh này bị loại (drop); chọn lại thì viết chuyển động khác`);

    const why = clip.why?.trim() ?? '';
    if (!why) errors.push(`${label}: thiếu "why" (vì sao chọn, tiếng Việt)`);
    const motion = clip.motion?.replace(/\s+/g, ' ').trim() ?? '';
    if (!motion) errors.push(`${label}: thiếu "motion"`);
    else {
      if (/[^\x00-\x7F]/.test(motion)) errors.push(`${label}: "motion" phải viết tiếng Anh, không dấu, không chữ Nhật`);
      if (motion.length < 25) errors.push(`${label}: "motion" quá ngắn (${motion.length} ký tự): tả ai cử động gì, vật gì lay động`);
      if (motion.length > 350) errors.push(`${label}: "motion" quá dài (${motion.length}/350 ký tự): một clip làm được 1–2 chuyển động`);
      const forbidden = MOTION_FORBIDDEN.exec(motion);
      if (forbidden) errors.push(`${label}: "motion" nhắc "${forbidden[0]}": máy quay do app quyết, không nhắc chữ/máy quay`);
      const risky = MOTION_RISKY.exec(motion);
      if (risky) warnings.push(`${label}: "${risky[0]}" là chuyển động lớn/nhanh, Veo hay làm méo hình; ưu tiên cử động nhỏ`);
      const hands = MOTION_HANDS.exec(motion);
      if (hands) warnings.push(`${label}: "${hands[0]}" cần ngón tay chi tiết, dễ méo`);
    }
    const imagePrompt = (row.scene.prompt ?? '').replace(NEGATED_TEXT, ' ');
    for (const [pattern, message] of IMAGE_RISKY) if (pattern.test(imagePrompt)) warnings.push(`${label}: ${message}`);
    clips.push({ scene: clip.scene, span, why, motion, startSec: row.startSec, windowSec: sec, lengthSec: sceneClipLengthSec(sec) });
  }

  // Budget and rhythm.
  if (clips.length === 0) errors.push('Kế hoạch không có clip nào.');
  if (clips.length > max) errors.push(`${clips.length} clip, quá mức ${max} (tăng bằng --max nếu người dùng đồng ý)`);
  const ordered = [...clips].sort((a, b) => a.startSec - b.startSec);
  const intro = ordered.filter(clip => clip.startSec < INTRO_SEC);
  if (intro.length === 0 && rows.some(row => row.startSec < INTRO_SEC && bestSpan(rows, row.n))) warnings.push('Không có clip nào trong 30 giây đầu, đoạn người xem quyết định ở lại');
  if (intro.length > 3) warnings.push(`${intro.length} clip trong 30 giây đầu: 2–3 là đủ`);
  const body = ordered.filter(clip => clip.startSec >= INTRO_SEC);
  for (let i = 1; i < body.length; i += 1) {
    const prev = body[i - 1]!;
    const gap = body[i]!.startSec - (prev.startSec + prev.windowSec);
    if (gap < MIN_GAP_SEC) warnings.push(`clip cảnh ${prev.scene} và ${body[i]!.scene} chỉ cách nhau ${r1(Math.max(0, gap))}s: trông như một hiệu ứng lặp`);
  }
  // Long stretches before the cut-off without a clip that still had candidates.
  const anchors = [INTRO_SEC, ...body.map(clip => clip.startSec), until];
  for (let i = 1; i < anchors.length && clips.length < max; i += 1) {
    const from = anchors[i - 1]!;
    const to = anchors[i]!;
    if (to - from <= MAX_GAP_SEC) continue;
    const options = rows.filter(row => row.startSec > from + MIN_GAP_SEC && row.startSec < to - MIN_GAP_SEC && bestSpan(rows, row.n));
    if (options.length === 0) continue;
    const near = new Set<number>();
    for (let t = from + BODY_EVERY_SEC; t < to - MIN_GAP_SEC; t += BODY_EVERY_SEC) {
      near.add(options.reduce((best, row) => (Math.abs(row.startSec - t) < Math.abs(best.startSec - t) ? row : best)).n);
    }
    warnings.push(`${clock(from)}–${clock(to)} không có clip; cảnh hợp rải đều: ${[...near].slice(0, 10).join(', ')}`);
  }

  const credits = clips.reduce((sum, clip) => sum + clip.lengthSec * CREDITS_PER_SEC, 0);
  return { passed: errors.length === 0, errors, warnings, clips, credits };
}

// ---------- ffmpeg ----------
const ffmpegExe = () => path.join(resolveFfmpegLocation(), process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');

/** Labelled contact sheet; runs from the font folder because drawtext cannot take a Windows drive path cleanly. */
function tileSheet(items: { file: string; seek?: number; label: string }[], out: string, cols: number, cellW: number, cellH: number) {
  const args = ['-v', 'error', '-y'];
  for (const item of items) args.push(...(item.seek === undefined ? [] : ['-ss', item.seek.toFixed(2)]), '-i', item.file);
  const labelH = 30;
  const cells = items.map(
    (item, i) =>
      `[${i}:v]scale=${cellW}:${cellH - labelH}:force_original_aspect_ratio=decrease,pad=${cellW}:${cellH}:(ow-iw)/2:${labelH}:black,` +
      `drawtext=fontfile=${FONT_FILE}:text='${item.label.replaceAll(':', '\\:').replaceAll("'", '')}':fontsize=20:fontcolor=white:x=8:y=4,setsar=1[c${i}]`,
  );
  const columns = Math.min(cols, items.length);
  const layout = items.map((_, i) => `${(i % columns) * cellW}_${Math.floor(i / columns) * cellH}`).join('|');
  const merge = items.length === 1 ? '[c0]null[v]' : `${items.map((_, i) => `[c${i}]`).join('')}xstack=inputs=${items.length}:layout=${layout}:fill=black[v]`;
  args.push('-filter_complex', `${cells.join(';')};${merge}`, '-map', '[v]', '-frames:v', '1', '-q:v', '3', out);
  execFileSync(ffmpegExe(), args, { cwd: FONT_DIR, stdio: ['ignore', 'ignore', 'inherit'] });
}

// ---------- commands ----------
async function scan() {
  const rows = [];
  for (const ref of resolveScope(target)) {
    if (!fs.existsSync(path.join(ref.dir, AI_SCENE_PROMPTS_FILENAME))) continue;
    const state = readState(ref);
    if (['made', 'reviewed'].includes(state?.status) && !has('force')) continue;
    const video = await loadVideo(ref);
    if (video.rows.length === 0) continue;
    const until = untilSec(video.totalSec);
    rows.push({
      channel: ref.channel.name,
      channelId: ref.channel.id,
      videoId: ref.videoId,
      status: ref.status,
      title: ref.title,
      scenes: video.rows.length,
      images: video.rows.filter(row => row.image).length,
      clips: video.rows.filter(row => row.clip).length,
      candidates: video.rows.filter(row => row.startSec < until && bestSpan(video.rows, row.n)).length,
      suggested: suggestedClips(video, until, DEFAULT_MAX).total,
      skill: state?.status ?? '-',
    });
  }
  rows.sort((a, b) => Number(b.images === b.scenes) - Number(a.images === a.scenes) || b.candidates - a.candidates);
  if (has('json')) return console.log(JSON.stringify(rows, null, 2));
  console.log(`${rows.length} video. Cột: kênh | video | trạng thái | cảnh | có ảnh | có clip | cảnh mở được khung ${WINDOW_GOOD_MIN}–${FLOW_CLIP_MAX_SEC}s (nửa đầu) | nên làm | skill | title`);
  for (const row of rows) {
    console.log(
      [row.channel.slice(0, 14).padEnd(14), row.videoId.padEnd(11), row.status.padEnd(8), String(row.scenes).padStart(4), String(row.images).padStart(4), String(row.clips).padStart(3), String(row.candidates).padStart(4), String(row.suggested).padStart(3), row.skill.padEnd(8), row.title.slice(0, 40)].join(' | '),
    );
  }
}

async function info() {
  const ref = resolveVideo(target);
  const video = await loadVideo(ref);
  const { rows } = video;
  if (rows.length === 0) fail('Video chưa có cảnh (ai-scene-prompts.json): tạo cảnh & ảnh trước.');
  if (!subtitlePath(ref.dir)) fail('Video chưa có transcript.srt / transcript-updated.srt.');
  const until = untilSec(video.totalSec);
  const state = readState(ref);
  const rejected: number[] = state?.rejected ?? [];
  const out = workDir(ref);
  fs.mkdirSync(out, { recursive: true });

  // Fixed style / mascot text repeated in every prompt hides the scene itself: show only what differs.
  const prompts = rows.filter(row => !row.isTitle && row.scene.prompt).map(row => row.scene.prompt.replace(/\s+/g, ' ').trim());
  const [prefix, suffix] = sharedEnds(prompts);
  const sceneOnly = (prompt: string) => {
    const text = prompt.replace(/\s+/g, ' ').trim();
    return text.slice(prefix, Math.max(prefix, text.length - suffix)).replace(/^[\s,.;]+|[\s,.;]+$/g, '') || text;
  };

  const lines: string[] = [
    `Khung clip tốt ${WINDOW_GOOD_MIN}–${WINDOW_GOOD_MAX}s. ✓ = cảnh tự đủ khung; "+k → Xs" = gộp với k cảnh sau thành Xs; ✗ = không mở được khung tốt. Clip chỉ đặt trước ${clock(until)}.`,
  ];
  let markedCutoff = false;
  for (const row of rows) {
    if (!markedCutoff && row.startSec >= until) {
      lines.push(`=== HẾT VÙNG CLIP (${clock(until)}): các cảnh sau chỉ để đọc mạch truyện ===`);
      markedCutoff = true;
    }
    if (row.chapter) lines.push(`=== CHƯƠNG: ${row.chapter} ===`);
    const span = bestSpan(rows, row.n);
    const fit = row.isTitle ? ' ' : !span ? '✗' : span === 1 ? '✓' : `+${span - 1} → ${r1(windowSec(rows, row.n, span))}s`;
    const marks = [
      row.isTitle ? 'THẺ TIÊU ĐỀ' : row.image ? null : 'CHƯA CÓ ẢNH',
      !row.chapter && row.boundary && !row.isTitle ? 'ĐẦU MỤC' : null,
      row.clip ? 'ĐÃ CÓ CLIP' : null,
      rejected.includes(row.n) ? 'ĐÃ LOẠI' : null,
      row.scene.clipSpan && row.scene.clipSpan > 1 ? `gộp ${row.scene.clipSpan} cảnh` : null,
      row.scene.motionPrompt ? `motion: ${row.scene.motionPrompt}` : null,
    ].filter(Boolean);
    lines.push(`#${row.n} ${clock(row.startSec)} (${r1(row.shownSec)}s) ${fit}${marks.length ? ` [${marks.join(' · ')}]` : ''}`);
    lines.push(`   lời: ${row.said || '(không có lời)'}`);
    if (!row.isTitle) lines.push(`   ảnh: ${sceneOnly(row.scene.prompt ?? '').slice(0, 300)}`);
  }
  fs.writeFileSync(path.join(out, 'scenes.txt'), `${lines.join('\n')}\n`, 'utf8');

  const inZone = rows.filter(row => row.startSec < until);
  const single = inZone.filter(row => bestSpan(rows, row.n) === 1).length;
  const merged = inZone.filter(row => (bestSpan(rows, row.n) ?? 0) > 1).length;
  const suggestion = suggestedClips(video, until, DEFAULT_MAX);
  console.log(`Video ${ref.videoId} · ${ref.channel.name} · ${ref.status} · "${ref.title}"`);
  console.log(`Thời lượng ${clock(video.totalSec)} · ${rows.length} cảnh · ${rows.filter(row => row.image).length} có ảnh · ${rows.filter(row => row.clip).length} đã có clip · ${video.chapters} chương`);
  console.log(`Vùng clip: 0:00–${clock(until)} (${Math.round((until / Math.max(1, video.totalSec)) * 100)}% video) · ${single} cảnh tự đủ khung ${WINDOW_GOOD_MIN}–${FLOW_CLIP_MAX_SEC}s · ${merged} cảnh gộp với cảnh sau thì đủ`);
  console.log(`Nên làm khoảng ${suggestion.total} clip: ${suggestion.intro} trong 30 giây đầu + ${suggestion.body} tới ${clock(until)} (1 clip / ~${BODY_EVERY_SEC}s), tối đa ${DEFAULT_MAX}. Mỗi clip dài đúng khung của nó (${FLOW_CLIP_MIN_SEC}–${FLOW_CLIP_MAX_SEC}s), khoảng ${CREDITS_PER_SEC} credit/giây.`);
  if (single + merged < suggestion.total) console.log('CHÚ Ý: ít khung hợp clip trong vùng này. Cân nhắc jp-psy-scene-split trước hoặc --until lớn hơn.');
  if (state) console.log(`Skill đã chạy: ${state.status}${state.appliedAt ? ` lúc ${state.appliedAt}` : ''}${state.clips?.length ? ` · ${state.clips.length} clip trong kế hoạch` : ''}${rejected.length ? ` · đã loại ${rejected.join(', ')}` : ''}`);
  if (!PRODUCTION.has(ref.status)) console.log(`CHÚ Ý: trạng thái ${ref.status}; app chỉ dựng lại video Prepared/Created.`);
  console.log(`Đã ghi: ${path.join(out, 'scenes.txt')}`);
  console.log(`Viết kế hoạch vào: ${path.join(out, 'plan.json')}`);
}

async function sheet() {
  const ref = resolveVideo(target);
  const video = await loadVideo(ref);
  const until = untilSec(video.totalSec);
  const only = rest.map(Number).filter(Number.isInteger);
  const picked = video.rows.filter(
    row => row.image && !row.isTitle && (only.length ? only.includes(row.n) : has('all') || (row.startSec < until && bestSpan(video.rows, row.n))),
  );
  if (picked.length === 0) fail('Không có ảnh cảnh nào để xem.');
  const out = path.resolve(flag('out') ?? path.join(workDir(ref), 'sheets'));
  fs.mkdirSync(out, { recursive: true });
  const perSheet = 9;
  for (let i = 0; i < picked.length; i += perSheet) {
    const file = path.join(out, `${ref.videoId.replace(/^-/, '_')}-candidates-${String(i / perSheet + 1).padStart(2, '0')}.jpg`);
    tileSheet(
      picked.slice(i, i + perSheet).map(row => {
        const span = bestSpan(video.rows, row.n);
        const fit = span && span > 1 ? `  +${span - 1}=${r1(windowSec(video.rows, row.n, span))}s` : '';
        return { file: row.image!, label: `#${row.n}  ${clock(row.startSec)}  ${r1(row.shownSec)}s${fit}${row.clip ? '  CLIP' : ''}` };
      }),
      file,
      3,
      512,
      318,
    );
    console.log(`IMAGE ${slashes(file)}`);
  }
}

async function check(): Promise<{ video: Video; result: CheckResult }> {
  const ref = resolveVideo(target);
  const video = await loadVideo(ref);
  if (video.rows.length === 0) fail('Video chưa có cảnh.');
  const max = Number(flag('max') ?? DEFAULT_MAX);
  if (!Number.isInteger(max) || max < 1) fail('--max phải là số nguyên dương.');
  const until = untilSec(video.totalSec);
  const result = checkPlan(loadPlan(ref, rest[0]), video, max, until, readState(ref)?.rejected ?? []);
  writeJson(path.join(workDir(ref), 'check.json'), { checkedAt: new Date().toISOString(), passed: result.passed, errors: result.errors, warnings: result.warnings, clips: result.clips, credits: result.credits });
  const intro = result.clips.filter(clip => clip.startSec < INTRO_SEC).length;
  const merged = result.clips.filter(clip => clip.span > 1).length;
  console.log(
    `${result.passed ? 'ĐẠT' : 'CHƯA ĐẠT'} · ${result.clips.length} clip (${intro} trong 30 giây đầu, ${merged} clip gộp cảnh) · tới ${clock(until)} · mức tối đa ${max} · khoảng ${result.credits} credit Flow`,
  );
  for (const clip of [...result.clips].sort((a, b) => a.scene - b.scene)) {
    console.log(`  cảnh ${clip.scene}${clip.span > 1 ? `–${clip.scene + clip.span - 1}` : ''} · ${clock(clip.startSec)} · hiện ${r1(clip.windowSec)}s → clip ${clip.lengthSec}s`);
  }
  for (const error of result.errors) console.log(`  LỖI  ${error}`);
  for (const warning of result.warnings) console.log(`  NHẮC ${warning}`);
  return { video, result };
}

async function apply() {
  const { video, result } = await check();
  if (!result.passed) fail('Chưa ĐẠT: sửa kế hoạch rồi chạy lại.');
  const { ref } = video;
  const backup = path.join(ref.dir, BACKUP_DIR, `${stamp()}-${AI_SCENE_PROMPTS_FILENAME}`);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(video.file, backup);

  const planned = new Map(result.clips.map(clip => [clip.scene, clip]));
  for (const [index, scene] of video.scenes.entries()) {
    const clip = planned.get(index + 1);
    delete scene.motionPrompt;
    delete scene.clipSpan;
    if (!clip) continue;
    scene.motionPrompt = clip.motion;
    if (clip.span > 1) scene.clipSpan = clip.span;
  }
  saveScenes(video);
  writeJson(path.join(ref.dir, 'motion-plan.json'), { clips: result.clips });

  const previous = readState(ref) ?? {};
  const clips = result.clips.map(clip => clip.scene).sort((a, b) => a - b);
  writeState(ref, {
    status: 'applied',
    appliedAt: new Date().toISOString(),
    clips,
    // Picking a rejected scene again (with a new motion) takes it off the rejected list.
    rejected: (previous.rejected ?? []).filter((n: number) => !clips.includes(n)),
    made: previous.made ?? [],
    credits: result.credits,
    backup: path.relative(ref.dir, backup),
  });
  const withClip = clips.filter(n => video.rows[n - 1]!.clip);
  console.log(`Đã ghi chuyển động cho ${clips.length} clip: cảnh ${clips.join(', ')}. Bản cũ: ${backup}`);
  if (withClip.length) console.log(`Cảnh đã có clip từ trước (make giữ nguyên; muốn làm theo chuyển động hay độ dài mới thì "redo"): ${withClip.join(', ')}`);
  console.log(`Tạo clip: \`npm run -s motion -- make <video>\` (server phải đang chạy, khoảng ${result.credits} credit Flow).`);
}

async function make() {
  const ref = resolveVideo(target);
  const state = readState(ref);
  if (!state?.clips?.length) fail('Video chưa áp kế hoạch của skill (motion-skill.json). Chạy apply trước.');
  if (!(await serverUp())) fail(`Server app không chạy ở cổng ${env.port}. Bật app rồi chạy lại.`);
  const busy = await serverBusy();
  if (busy > 0) console.log(`CHÚ Ý: hàng đợi app đang có ${busy} việc; tạo clip sẽ tranh profile Flow với các việc đó.`);

  const video = await loadVideo(ref);
  const rejected: number[] = state.rejected ?? [];
  const only = rest.map(Number).filter(Number.isInteger);
  const planned: number[] = state.clips;
  if (only.some(n => !planned.includes(n))) fail(`Cảnh ${only.filter(n => !planned.includes(n)).join(', ')} không có trong kế hoạch.`);
  const todo = (only.length ? only : planned).filter(n => !rejected.includes(n) && video.rows[n - 1] && !video.rows[n - 1]!.clip);
  if (todo.length === 0) return console.log('Các cảnh cần làm đều đã có clip (hoặc đã bị loại). Không có gì để làm.');
  const lengths = todo.map(n => sceneClipLengthSec(windowSec(video.rows, n, video.scenes[n - 1]!.clipSpan ?? 1)));

  const base = `/video-production/videos/${ref.channel.id}/${ref.videoId}/motion`;
  console.log(`Gửi server tạo ${todo.length} clip qua Google Flow: ${todo.map((n, i) => `cảnh ${n} (${lengths[i]}s)`).join(', ')} · khoảng ${lengths.reduce((a, b) => a + b, 0) * CREDITS_PER_SEC} credit (lâu, đừng tắt app)…`);
  const started = Date.now();
  const response = await serverRequest('POST', base, { mode: 'scenes', indexes: todo.map(n => n - 1) });
  if (response.status >= 400) fail(`Server báo lỗi ${response.status}: ${JSON.stringify(response.body).slice(0, 300)}`);

  let job = response.body?.job;
  while (job?.status === 'running') {
    if (Date.now() - started > MAKE_TIMEOUT_MS) fail('Quá 4 giờ mà Flow chưa xong; xem tab "Ảnh → video" trong app.');
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
    const poll = await serverRequest('GET', base);
    job = poll.body?.job;
    if (job?.message) process.stderr.write(`\r${job.message.slice(0, 120).padEnd(120)}`);
  }
  process.stderr.write('\n');

  const after = await loadVideo(ref);
  const made = planned.filter(n => after.rows[n - 1]?.clip);
  const missing = todo.filter(n => !after.rows[n - 1]?.clip);
  writeState(ref, { ...readState(ref), status: made.length === planned.length - rejected.filter(n => planned.includes(n)).length ? 'made' : 'partial', madeAt: new Date().toISOString(), made, failed: missing });
  console.log(`Xong sau ${r1((Date.now() - started) / 60000)} phút: ${job?.status === 'failed' ? `LỖI ${job.error}` : (job?.message ?? '')}`);
  console.log(`${made.length}/${planned.length} clip trong kế hoạch đã có.${missing.length ? ` Chưa có: ${missing.join(', ')} (chạy make lại; hết lượt Flow thì để mai)` : ''}`);
  console.log('Duyệt clip: `npm run -s motion -- frames <video> --out <scratchpad>`.');
}

async function frames() {
  const ref = resolveVideo(target);
  const state = readState(ref);
  const video = await loadVideo(ref);
  const wanted: number[] = rest.length ? rest.map(Number) : (state?.clips ?? video.rows.filter(row => row.clip).map(row => row.n));
  const withClip = wanted.map(n => video.rows[n - 1]).filter((row): row is SceneRow => Boolean(row?.clip));
  if (withClip.length === 0) fail('Chưa có clip nào để xem.');
  const out = path.resolve(flag('out') ?? path.join(workDir(ref), 'frames'));
  fs.mkdirSync(out, { recursive: true });
  for (const row of withClip) {
    const span = video.scenes[row.n - 1]!.clipSpan ?? 1;
    const shown = windowSec(video.rows, row.n, span);
    const length = await getMediaDurationSeconds(row.clip!).catch(() => FLOW_CLIP_MAX_SEC);
    const played = Math.min(length, shown);
    const seeks = [0.8, played / 2, Math.max(0.5, played - 0.3)];
    const file = path.join(out, `${ref.videoId.replace(/^-/, '_')}-clip-${String(row.n).padStart(3, '0')}.jpg`);
    tileSheet(
      [{ file: row.image ?? row.clip!, label: `#${row.n} anh goc` }, ...seeks.map(seek => ({ file: row.clip!, seek, label: `#${row.n} clip ${r1(seek)}s` }))],
      file,
      2,
      640,
      390,
    );
    const freeze = shown - length;
    const note = freeze > 0.5 ? `, đứng hình ${r1(freeze)}s cuối` : freeze < -0.5 ? `, cắt bỏ ${r1(-freeze)}s cuối clip` : '';
    console.log(`IMAGE ${slashes(file)}  (cảnh ${row.n}${span > 1 ? `–${row.n + span - 1}` : ''}: hiện ${r1(shown)}s, clip ${r1(length)}s${note}) motion: ${row.scene.motionPrompt ?? '(chung)'}`);
  }
}

async function removeClips(drop: boolean) {
  const ref = resolveVideo(target);
  const state = readState(ref) ?? { status: 'applied', clips: [] };
  const video = await loadVideo(ref);
  const all = rest[0] === 'all';
  if (all && !drop) fail('"redo all" không hợp lệ: chọn từng cảnh.');
  const numbers = all ? (state.clips as number[]) : rest.map(Number);
  if (numbers.length === 0 || numbers.some(n => !video.rows[n - 1])) fail(`Cảnh không hợp lệ: ${rest.join(' ')}`);

  const up = await serverUp();
  for (const n of numbers) {
    if (!video.rows[n - 1]!.clip) continue;
    if (up) {
      const response = await serverRequest('DELETE', `/video-production/videos/${ref.channel.id}/${ref.videoId}/motion/${n - 1}`);
      if (response.status >= 400) fail(`Server báo lỗi khi bỏ clip cảnh ${n}: ${JSON.stringify(response.body).slice(0, 200)}`);
    } else {
      fs.rmSync(path.join(ref.dir, AI_VIDEOS_DIRNAME, `scene-${String(n).padStart(3, '0')}.mp4`), { force: true });
      const fresh = await loadVideo(ref);
      delete fresh.scenes[n - 1]!.videoPath;
      saveScenes(fresh);
    }
  }
  if (drop && all) {
    const fresh = await loadVideo(ref);
    for (const scene of fresh.scenes) {
      delete scene.motionPrompt;
      delete scene.clipSpan;
    }
    saveScenes(fresh);
    writeState(ref, { ...state, status: 'cleared', clearedAt: new Date().toISOString(), made: [] });
    return console.log(`Đã bỏ mọi clip của skill (${numbers.join(', ')}) và xoá chuyển động; các cảnh dùng lại ảnh tĩnh.`);
  }
  const rejected = new Set<number>(state.rejected ?? []);
  for (const n of numbers) drop ? rejected.add(n) : rejected.delete(n);
  writeState(ref, { ...state, rejected: [...rejected].sort((a, b) => a - b), made: (state.made ?? []).filter((n: number) => !numbers.includes(n)) });
  console.log(
    drop
      ? `Đã bỏ clip cảnh ${numbers.join(', ')}: cảnh (và các cảnh nó gộp) dùng lại ảnh tĩnh, make sẽ không làm lại.`
      : `Đã bỏ clip cảnh ${numbers.join(', ')}: make sẽ làm lại theo chuyển động đang ghi (sửa plan.json rồi apply trước nếu muốn đổi).`,
  );
}

const commands: Record<string, () => Promise<unknown>> = {
  scan,
  info,
  sheet,
  check,
  apply,
  make,
  frames,
  drop: () => removeClips(true),
  redo: () => removeClips(false),
};
const run = commands[command ?? ''];
if (!run) {
  console.log(
    'Dùng: npm run -s motion -- scan [kênh|video] [--json] [--force] | info <video> [--until 50%] | sheet <video> [cảnh…] [--all] [--out dir] | check <video> [plan.json] [--max N] [--until 50%] | apply <video> [plan.json] [--max N] [--until 50%] | make <video> [cảnh…] | frames <video> [cảnh…] [--out dir] | drop <video> <cảnh…|all> | redo <video> <cảnh…>',
  );
  process.exit(command ? 1 : 0);
}
run!()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
