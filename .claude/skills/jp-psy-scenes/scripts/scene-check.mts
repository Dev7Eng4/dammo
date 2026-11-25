/**
 * Machine side of the jp-psy-scenes skill: when does each scene image really appear in the assembled video, and
 * what is being said then? The on-screen times come from the app's own assemble functions (slide durations, holds
 * for missing images, crossfade offsets, audio speed), so they change when the app's assembly changes.
 *
 * Run from server/ :
 *   CHECK=../.claude/skills/jp-psy-scenes/scripts/scene-check.mts
 *   node_modules/.bin/tsx $CHECK scan   [<channel id|dir>] [--status Created] [--force]
 *   node_modules/.bin/tsx $CHECK check  <video id|dir> --out <dir>      # summary; full scene table in <dir>/<id>.scenes.json
 *   node_modules/.bin/tsx $CHECK sheet  <video> --out <dir>             # labelled contact sheets of the scene images
 *   node_modules/.bin/tsx $CHECK frames <video> --out <dir>             # frames of the rendered mp4 (captions included)
 *   node_modules/.bin/tsx $CHECK save   <video> <review.json> [--partial]
 * Only `save` writes to the video folder, and only scene-review.json.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const serverSrc = path.join(repoRoot, 'server/src');
const channelsDir = path.join(repoRoot, 'server/data/youtube-channels');
const load = (rel: string) => import(pathToFileURL(path.join(serverSrc, rel)).href);

const SUBTITLES = ['transcript-updated.srt', 'transcript.srt'];
const REVIEW_FILE = 'scene-review.json';
/** Narration text running this far past the audio means the audio file is cut off. */
const CUT_AUDIO_SEC = 5;
/** A scene whose image covers less than this share of its own narration is off schedule. */
const ON_TIME_MIN = 0.7;
const DRIFT_WARN_SEC = 3;
const SHORT_SCENE_SEC = 2;
const LONG_SCENE_SEC = 60;
const PASS_PERCENT = 85;
const VERDICT = { ok: 1, weak: 0.5, wrong: 0 } as const;

type Verdict = keyof typeof VERDICT;
interface Scene {
  prompt: string;
  startTime: string;
  endTime: string;
  type?: string;
  title?: string;
  path?: string;
  videoPath?: string;
}

const readJson = (file: string): any => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const clock = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, '0')}`;
const slashes = (p: string) => p.replaceAll('\\', '/');
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};
const has = (name: string) => argv.includes(`--${name}`);
const VALUE_FLAGS = ['--out', '--status'];
// A video id may start with one "-", so only "--" marks a flag.
const positional = argv.filter((arg, i) => !arg.startsWith('--') && !VALUE_FLAGS.includes(argv[i - 1] ?? ''));
const [command, target, extra] = positional;

// ---------- locate ----------
function findVideoDir(input: string | undefined): string {
  if (!input) return fail('Thiếu video (id hoặc đường dẫn thư mục).');
  if (/[\\/]/.test(input) && fs.existsSync(input)) return path.resolve(input);
  for (const channel of fs.readdirSync(channelsDir)) {
    const dir = path.join(channelsDir, channel, 'videos', input);
    if (fs.existsSync(dir)) return dir;
  }
  return fail(`Không thấy video: ${input}`);
}

async function channelOf(videoDir: string): Promise<{ id: string; record?: any }> {
  const id = path.basename(path.resolve(videoDir, '../..'));
  const { youtubeChannelsRepository } = await load('modules/youtube-channels/youtube-channels.repository.ts');
  return { id, record: youtubeChannelsRepository.findById(id) };
}

// ---------- analysis ----------
async function analyse(videoDir: string) {
  const { srtTimestampToMs, parseSrt } = await load('infrastructure/subtitle/srt-utils.ts');
  const timing = await load('modules/video-production/shared/ai-video/ai-video-scene-timing.ts');
  const spec = await load('modules/video-production/shared/ai-video/ai-video-slide-spec.ts');
  const { slideVisibleDuration } = await load('modules/video-production/shared/slideshow/slideshow-assembler.ts');
  const { buildXfadeChain } = await load('modules/video-production/shared/slideshow/slideshow-transitions.ts');
  const { isImageTransitionsEnabled } = await load('modules/video-production/shared/slideshow/slideshow.constants.ts');
  const { getAudioDurationSeconds } = await load('infrastructure/ffmpeg/ffmpeg-probe.ts');
  const { findFinalVideoMp4 } = await load('modules/video-production/shared/render-core/video-output-file.ts');

  const file = readJson(path.join(videoDir, 'ai-scene-prompts.json'));
  if (!file?.scenes?.length) throw new Error('chưa có ai-scene-prompts.json');
  if (file.scenes.length < 2) throw new Error('video một ảnh tĩnh, không có mốc cảnh để kiểm tra');
  const subtitle = SUBTITLES.find(name => fs.existsSync(path.join(videoDir, name)));
  if (!subtitle) throw new Error('chưa có transcript.srt');
  const audio = path.join(videoDir, 'audio.mp3');
  if (!fs.existsSync(audio)) throw new Error('chưa có audio.mp3');

  const channel = await channelOf(videoDir);
  // Same rule as resolveFixedAudioSpeed(): remake videos are assembled at speed 1.
  const speed: number =
    channel.record?.type === 'remake_video' ? 1 : (readJson(path.join(videoDir, 'ai-render-config.json'))?.audioSpeed ?? 1);
  const scenes: Scene[] = await timing.attachSceneImagePaths(file.scenes, videoDir);
  if (!scenes.some(scene => scene.path)) throw new Error('chưa có ảnh cảnh nào');
  const cues: { start: number; end: number; text: string }[] = parseSrt(
    fs.readFileSync(path.join(videoDir, subtitle), 'utf8'),
  ).map((b: any) => ({
    start: srtTimestampToMs(b.start) / 1000,
    end: srtTimestampToMs(b.end) / 1000,
    text: b.text.replace(/\s+/g, ''),
  }));
  const audioSec: number = await getAudioDurationSeconds(audio);

  // On-screen windows, in the app's order of operations (ai-video-assembler.ts).
  const scaled = timing.scaleSceneTimestamps(scenes, speed);
  const slides = spec.addAudioDeficitHold(spec.buildAiTimelineSlides(videoDir, scaled), audioSec / speed);
  const durations: number[] = slides.map(slideVisibleDuration);
  const transitionsOn: boolean = isImageTransitionsEnabled();
  const starts: number[] = [0];
  if (transitionsOn && slides.length > 1) {
    const chain = buildXfadeChain({
      clipCount: slides.length,
      durations,
      transitions: slides.slice(0, -1).map((s: any) => ({ type: 'fade', durationSec: s.transitionDurationSec ?? 1 })),
    });
    // A new image takes over in the middle of its crossfade.
    for (const m of chain.filter.matchAll(/duration=([\d.]+):offset=([\d.]+)/g)) starts.push(Number(m[2]) + Number(m[1]) / 2);
  } else {
    for (const d of durations.slice(0, -1)) starts.push(starts.at(-1)! + d);
  }

  const said = (from: number, to: number) =>
    cues
      .filter(c => Math.min(c.end, to) - Math.max(c.start, from) >= Math.min(0.5, (c.end - c.start) / 2))
      .map(c => c.text)
      .join('');
  const rows = scenes.map((scene, index) => {
    const start = srtTimestampToMs(scene.startTime) / 1000;
    const end = srtTimestampToMs(scene.endTime) / 1000;
    const planned = Math.max(0, end - start);
    // An image can be left out of the slides (its time is taken by an overlapping scene) or be reordered.
    const imagePath = scene.path ? path.resolve(videoDir, scene.path) : null;
    const k = imagePath ? slides.findIndex((s: any) => path.resolve(s.imagePath) === imagePath) : -1;
    // Back to transcript time, so windows and cues share one clock.
    const shownStart = k === -1 ? null : Math.min(audioSec, starts[k]! * speed);
    const shownEnd = k === -1 ? null : Math.min(audioSec, k + 1 < starts.length ? starts[k + 1]! * speed : audioSec);
    const overlap = shownStart === null ? 0 : Math.max(0, Math.min(end, shownEnd!) - Math.max(start, shownStart));
    return {
      n: index + 1,
      type: scene.type ?? 'image',
      image: scene.path ?? null,
      clip: scene.videoPath ?? null,
      start: r1(start),
      end: r1(end),
      planned: r1(planned),
      shownStart: shownStart === null ? null : r1(shownStart),
      shownEnd: shownEnd === null ? null : r1(shownEnd),
      drift: shownStart === null ? null : r1(shownStart - start),
      onTime: planned > 0 ? Math.round((overlap / planned) * 100) / 100 : 0,
      prompt: scene.prompt || scene.title || '',
      saidPlanned: said(start, end),
      saidWhileShown: shownStart === null ? '' : said(shownStart, shownEnd!),
    };
  });
  type Row = (typeof rows)[number];

  // ---------- machine findings ----------
  const groups = (key: (r: Row) => string | null) => {
    const map = new Map<string, number[]>();
    for (const r of rows) {
      const k = key(r);
      if (k) map.set(k, [...(map.get(k) ?? []), r.n]);
    }
    return [...map.values()].filter(list => list.length > 1);
  };
  const withImage = rows.filter(r => r.image);
  const shown = withImage.filter(r => r.shownStart !== null);
  const worst = shown.reduce((a, b) => (Math.abs(b.drift!) > Math.abs(a.drift!) ? b : a));
  // Narration time with no scene planned over it: before the first, between scenes, after the last.
  let uncovered = 0;
  let reach = 0;
  for (const r of [...rows].sort((a, b) => a.start - b.start)) {
    uncovered += Math.max(0, r.start - reach);
    reach = Math.max(reach, r.end);
  }
  uncovered += Math.max(0, audioSec - reach);
  const plannedTotal = rows.reduce((s, r) => s + r.planned, 0) || 1;
  const mp4: string | null = findFinalVideoMp4(videoDir);
  return {
    videoId: path.basename(videoDir),
    videoDir,
    channel: { id: channel.id, name: channel.record?.name ?? '?', type: channel.record?.type ?? '?' },
    subtitle,
    audioSec: r1(audioSec),
    speed,
    transitionsOn,
    findings: {
      sceneCount: rows.length,
      imageCount: withImage.length,
      onSchedulePercent: Math.round((rows.reduce((s, r) => s + r.planned * r.onTime, 0) / plannedTotal) * 100),
      firstDrift: shown.find(r => Math.abs(r.drift!) > DRIFT_WARN_SEC)?.n ?? null,
      worstDrift: { n: worst.n, sec: worst.drift! },
      offSchedule: withImage.filter(r => r.onTime < ON_TIME_MIN).map(r => r.n),
      neverShown: withImage.filter(r => r.shownStart === null || r.shownEnd! - r.shownStart < 0.2).map(r => r.n),
      missing: rows.filter(r => !r.image).map(r => ({ n: r.n, sec: r.planned })),
      overlaps: rows.flatMap((r, i) => (i && r.start < rows[i - 1]!.end - 0.05 ? [{ n: r.n, sec: r1(rows[i - 1]!.end - r.start) }] : [])),
      gaps: rows.flatMap((r, i) => (i && r.start > rows[i - 1]!.end + 0.5 ? [{ n: r.n, sec: r1(r.start - rows[i - 1]!.end) }] : [])),
      uncoveredSec: r1(uncovered),
      audioCutSec: r1(Math.max(0, (cues.at(-1)?.end ?? 0) - audioSec)),
      duplicateImages: groups(r =>
        r.image && r.type !== 'title'
          ? crypto.createHash('md5').update(fs.readFileSync(path.join(videoDir, r.image))).digest('hex')
          : null,
      ),
      duplicatePrompts: groups(r => (r.type !== 'title' ? r.prompt.trim() || null : null)),
      tooShort: rows.filter(r => r.planned < SHORT_SCENE_SEC).map(r => r.n),
      tooLong: rows.filter(r => r.planned > LONG_SCENE_SEC).map(r => ({ n: r.n, sec: r.planned })),
    },
    mp4: mp4 ? { file: mp4, renderedAt: fs.statSync(mp4).mtime.toISOString().slice(0, 10) } : null,
    scenes: rows,
  };
}
type Analysis = Awaited<ReturnType<typeof analyse>>;

function printSummary(a: Analysis) {
  const f = a.findings;
  /** Long lists are cut to the worst ones; the json file has every entry. */
  const list = (items: { n: number; sec: number }[]) => {
    if (!items.length) return 'không';
    const total = r1(items.reduce((sum, x) => sum + x.sec, 0));
    const worstFirst = [...items].sort((x, y) => y.sec - x.sec).slice(0, 8);
    return `${items.length} cảnh, tổng ${total}s: ${worstFirst.map(x => `#${x.n} (${x.sec}s)`).join(', ')}${items.length > 8 ? '…' : ''}`;
  };
  /** 1,2,3,7 → #1–#3, #7 */
  const nums = (items: number[]) => {
    const runs: number[][] = [];
    for (const n of items) {
      const last = runs.at(-1);
      if (last && n === last[1]! + 1) last[1] = n;
      else runs.push([n, n]);
    }
    return runs.map(([from, to]) => (from === to ? `#${from}` : `#${from}–#${to}`)).join(', ') || 'không';
  };
  const sameAs = (items: number[][]) => items.map(g => g.map(n => `#${n}`).join('=')).join(', ') || 'không';
  console.log(
    [
      `${a.videoId} | ${a.channel.name} | ${f.sceneCount} cảnh, ${f.imageCount} ảnh | audio ${clock(a.audioSec)} | tốc độ ${a.speed.toFixed(3)} | chuyển cảnh ${a.transitionsOn ? 'bật' : 'tắt'} | ${a.subtitle}`,
      `Đúng giờ khi ghép: ${f.onSchedulePercent}% thời lượng cảnh`,
      `Lệch lớn nhất: #${f.worstDrift.n} ${f.worstDrift.sec > 0 ? 'trễ' : 'sớm'} ${Math.abs(f.worstDrift.sec)}s | lệch quá ${DRIFT_WARN_SEC}s bắt đầu từ: ${f.firstDrift ? `#${f.firstDrift}` : 'không'}`,
      `Cảnh lệch giờ (phủ dưới ${ON_TIME_MIN * 100}% lời của mình): ${f.offSchedule.length} → ${nums(f.offSchedule)}`,
      ...(f.audioCutSec > CUT_AUDIO_SEC ? [`AUDIO BỊ CỤT: phụ đề dài hơn audio ${f.audioCutSec}s`] : []),
      `Không bao giờ hiện: ${nums(f.neverShown)}`,
      `Thiếu ảnh: ${list(f.missing)}`,
      `Chồng giờ cảnh trước: ${list(f.overlaps)}`,
      `Hở giờ: ${list(f.gaps)} | lời không có cảnh nào: ${f.uncoveredSec}s`,
      `Ảnh trùng: ${sameAs(f.duplicateImages)} | prompt trùng: ${sameAs(f.duplicatePrompts)}`,
      `Ngắn dưới ${SHORT_SCENE_SEC}s: ${nums(f.tooShort)} | dài trên ${LONG_SCENE_SEC}s: ${list(f.tooLong)}`,
      `Video đã render: ${a.mp4 ? `${a.mp4.renderedAt} | ${slashes(a.mp4.file)}` : 'chưa'}`,
    ].join('\n'),
  );
}

// ---------- images ----------
const FONT_DIR = path.join(repoRoot, 'server/data/assets/fonts');
const FONT_FILE = 'NotoSerifJP-SemiBold.ttf';
const PER_SHEET = 9;
const CELL_W = 512;
const CELL_H = 318;

/** Runs ffmpeg from the font folder: drawtext cannot take a Windows drive path without fragile escaping. */
function tileSheet(exe: string, items: { file: string; seek?: number; label: string }[], out: string) {
  const args = ['-v', 'error', '-y'];
  for (const item of items) args.push(...(item.seek === undefined ? [] : ['-ss', item.seek.toFixed(2)]), '-i', item.file);
  const cells = items.map(
    (item, i) =>
      `[${i}:v]scale=${CELL_W}:288:force_original_aspect_ratio=decrease,pad=${CELL_W}:${CELL_H}:(ow-iw)/2:30:black,` +
      `drawtext=fontfile=${FONT_FILE}:text='${item.label.replaceAll(':', '\\:')}':fontsize=20:fontcolor=white:x=8:y=4,setsar=1[c${i}]`,
  );
  const cols = Math.min(3, items.length);
  const layout = items.map((_, i) => `${(i % cols) * CELL_W}_${Math.floor(i / cols) * CELL_H}`).join('|');
  const merge =
    items.length === 1
      ? '[c0]null[v]'
      : `${items.map((_, i) => `[c${i}]`).join('')}xstack=inputs=${items.length}:layout=${layout}:fill=black[v]`;
  args.push('-filter_complex', `${cells.join(';')};${merge}`, '-map', '[v]', '-frames:v', '1', '-q:v', '3', out);
  execFileSync(exe, args, { cwd: FONT_DIR, stdio: ['ignore', 'ignore', 'inherit'] });
}

async function makeSheets(a: Analysis, outDir: string, kind: 'sheet' | 'frames') {
  const { resolveFfmpegLocation } = await load('infrastructure/ffmpeg/ffmpeg-location.ts');
  const exe = path.join(resolveFfmpegLocation(), process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  fs.mkdirSync(outDir, { recursive: true });
  let items: { file: string; seek?: number; label: string }[];
  if (kind === 'sheet') {
    items = a.scenes
      .filter(s => s.image)
      .map(s => ({
        file: path.resolve(a.videoDir, s.image!),
        label: `#${s.n}  ${clock(s.start)}-${clock(s.end)}${s.type === 'title' ? '  TITLE' : ''}`,
      }));
  } else {
    if (!a.mp4) fail('Video chưa render (không có mp4): dùng sheet.');
    const file = path.resolve(a.mp4!.file);
    items = a.scenes.map(s => {
      const mid = (s.start + s.end) / 2;
      return { file, seek: mid / a.speed, label: `loi #${s.n}  ${clock(mid)}` };
    });
  }
  for (let i = 0; i < items.length; i += PER_SHEET) {
    const part = String(i / PER_SHEET + 1).padStart(2, '0');
    const out = path.resolve(outDir, `${a.videoId.replace(/^-/, '_')}-${kind}-${part}.jpg`);
    tileSheet(exe, items.slice(i, i + PER_SHEET), out);
    console.log(`IMAGE ${slashes(out)}`);
  }
}

// ---------- commands ----------
async function scan() {
  const only = target ? path.basename(slashes(target).replace(/\/+$/, '')) : undefined;
  if (only && !fs.existsSync(path.join(channelsDir, only))) fail(`Không thấy kênh: ${only}`);
  const status = flag('status');
  const rows: { percent: number; line: string }[] = [];
  let skipped = 0;
  for (const id of fs.readdirSync(channelsDir).filter(c => !only || c === only)) {
    const videos = path.join(channelsDir, id, 'videos');
    if (!fs.existsSync(videos)) continue;
    const prepared: any[] = readJson(path.join(channelsDir, id, 'video-prepare.json')) ?? [];
    for (const name of fs.readdirSync(videos)) {
      const dir = path.join(videos, name);
      if (!fs.existsSync(path.join(dir, 'ai-scene-prompts.json'))) continue;
      const st = prepared.find(p => p.videoId === name)?.status ?? '-';
      if (status && st !== status) continue;
      const review = readJson(path.join(dir, REVIEW_FILE));
      if (review && !review.partial && !has('force')) {
        skipped += 1;
        continue;
      }
      const head = `${id.slice(0, 8)} | ${name} | ${st}`;
      try {
        const f = (await analyse(dir)).findings;
        rows.push({
          percent: f.onSchedulePercent,
          line: `${String(f.onSchedulePercent).padStart(3)}% | ${head} | ${f.sceneCount} cảnh | thiếu ${f.missing.length} | chồng ${f.overlaps.length} | hở ${f.gaps.length} | lệch nhất ${f.worstDrift.sec}s | lệch giờ ${f.offSchedule.length}${f.audioCutSec > CUT_AUDIO_SEC ? ` | AUDIO CỤT ${f.audioCutSec}s` : ''}`,
        });
      } catch (err) {
        rows.push({ percent: 999, line: `  - | ${head} | không kiểm được: ${(err as Error).message}` });
      }
    }
  }
  console.log(`${rows.length} video; đã chấm xong, bỏ qua: ${skipped}. Xếp theo % đúng giờ tăng dần:`);
  for (const row of rows.sort((x, y) => x.percent - y.percent)) console.log(row.line);
}

function save(a: Analysis, reviewFile: string | undefined) {
  const input = reviewFile ? readJson(reviewFile) : undefined;
  if (!Array.isArray(input?.scenes)) fail('Cần file review.json dạng { "summary": "", "scenes": [{ "n", "verdict", "note", "fix" }] }.');
  const byN = new Map<number, { verdict: Verdict; note: string; fix: string }>();
  const problems: string[] = [];
  for (const s of input.scenes) {
    const row = a.scenes.find(x => x.n === s.n);
    if (!row) problems.push(`cảnh #${s.n} không có`);
    else if (!row.image) problems.push(`cảnh #${s.n} không có ảnh, không chấm`);
    else if (!Object.hasOwn(VERDICT, s.verdict)) problems.push(`cảnh #${s.n}: verdict phải là ok / weak / wrong`);
    else if (s.verdict !== 'ok' && !s.note?.trim()) problems.push(`cảnh #${s.n}: ${s.verdict} cần note`);
    else if (byN.has(s.n)) problems.push(`cảnh #${s.n} bị chấm hai lần`);
    else byN.set(s.n, { verdict: s.verdict, note: s.note ?? '', fix: s.fix ?? '' });
  }
  const todo = a.scenes.filter(s => s.image && s.type !== 'title' && !byN.has(s.n)).map(s => s.n);
  if (todo.length && !has('partial')) problems.push(`chưa chấm: ${todo.join(', ')} (hoặc thêm --partial)`);
  if (problems.length) fail(problems.join('\n'));

  // Title cards show the heading text itself, so they match unless the reviewer says otherwise.
  // A partial review scores only what was looked at.
  const partial = todo.length > 0;
  const counted = a.scenes.filter(s => byN.has(s.n) || (!partial && (!s.image || s.type === 'title')));
  const total = counted.reduce((sum, s) => sum + s.planned, 0) || 1;
  const points = (s: Analysis['scenes'][number]) => (s.image ? VERDICT[byN.get(s.n)?.verdict ?? 'ok'] : 0);
  const percent = (weight: (s: Analysis['scenes'][number]) => number) =>
    Math.round((counted.reduce((sum, s) => sum + s.planned * points(s) * weight(s), 0) / total) * 100);
  const contentPercent = percent(() => 1);
  const onScreenPercent = percent(s => s.onTime);
  const review = {
    skill: 'jp-psy-scenes',
    reviewedAt: new Date().toISOString(),
    partial,
    contentPercent,
    onScreenPercent,
    pass: !partial && contentPercent >= PASS_PERCENT && onScreenPercent >= PASS_PERCENT,
    summary: input.summary ?? '',
    findings: a.findings,
    scenes: [...byN].sort((x, y) => x[0] - y[0]).map(([n, v]) => ({ n, ...v })),
  };
  const out = path.join(a.videoDir, REVIEW_FILE);
  fs.writeFileSync(out, JSON.stringify(review, null, 2));
  const count = (v: Verdict) => [...byN.values()].filter(x => x.verdict === v).length;
  console.log(
    `${a.videoId}: ảnh đúng lời ${contentPercent}% | đúng lời và đúng giờ khi ghép ${onScreenPercent}% | ${partial ? 'MỚI CHẤM MỘT PHẦN' : review.pass ? 'ĐẠT' : 'CHƯA ĐẠT'} (mốc ${PASS_PERCENT}%)`,
  );
  console.log(`ok ${count('ok')}, weak ${count('weak')}, wrong ${count('wrong')}, thiếu ảnh ${a.findings.missing.length} → ${slashes(out)}`);
}

async function main() {
  if (command === 'scan') return scan();
  if (!['check', 'sheet', 'frames', 'save'].includes(command ?? '')) fail('Lệnh: scan | check | sheet | frames | save (xem đầu file).');
  const a: Analysis = await analyse(findVideoDir(target)).catch(err => fail(`Không kiểm được: ${(err as Error).message}`));
  if (command === 'save') return save(a, extra);
  const out = flag('out') ?? fail('Thiếu --out <thư mục scratchpad>.');
  if (command === 'sheet' || command === 'frames') return makeSheets(a, out, command);
  printSummary(a);
  fs.mkdirSync(out, { recursive: true });
  const file = path.resolve(out, `${a.videoId.replace(/^-/, '_')}.scenes.json`);
  fs.writeFileSync(file, JSON.stringify(a, null, 1));
  console.log(`Bảng cảnh: ${slashes(file)}`);
}

await main();
process.exit(0);
