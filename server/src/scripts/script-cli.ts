/**
 * CLI of the script skills (.claude/skills/jp-psy-script-remake, jp-psy-script-niche): fetches source videos and
 * checks a finished script with the same rules the app's remake flow uses. Writing is done by Claude.
 *
 *   npm run -s script -- source <url | videoId>... [--lang ja]     # info + clean transcript, kept for later checks
 *   npm run -s script -- list [--cluster K3]                       # scripts already written (docs/scripts) and topics
 *   npm run -s script -- check <script.txt> [--minutes 18] [--source <videoId>]... [--part] [--save]
 *   npm run -s script -- queue [--channel <id>] [--limit 3] [--json]   # next sources of remake channels + ready-script status
 *   npm run -s script -- readings <script.txt> [--speaker N]       # numbers / names / Latin words and how VOICEVOX reads them
 *   npm run -s script -- dict [list | add <chữ> <カタカナ> [--note …] | rm <chữ>]   # reading dictionary of the narration voice
 *
 * `--part` checks an unfinished script (chapters written so far): length of the whole video is not judged.
 * `--save` writes check.json next to the script (pass/fail + hash of the text). "Chuẩn bị video" narrates a
 * ready script (data/youtube-channels/<channel>/remake-ready/<sourceVideoId>/) only when that check passed.
 * Script format (what the app's script editor reads): "# title", then "## 1. heading" and one sentence per line.
 */
import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../config/paths.js';
import { getYoutubeDlCommonOptions } from '../infrastructure/youtube/youtube-dl-auth.js';
import { youtubeDl } from '../infrastructure/youtube/youtube-dl-client.js';
import { downloadYoutubeTranscript, type TranscriptLanguage } from '../infrastructure/youtube/youtube-transcript-downloader.js';
import { extractYoutubeVideoId } from '../infrastructure/youtube/youtube-url.js';
import { cleanSrt } from '../infrastructure/subtitle/clean-srt.js';
import { chapterProblems, sourceCopiedSentences } from '../modules/script-remake/script-remake.quality.js';
import { splitSentences, transcriptToPlainText } from '../modules/script-remake/script-remake.service.js';
import { validateLength } from '../modules/video-agent/outline-rules.js';
import { NARRATION_CHARS_PER_MIN } from '../modules/video-agent/script-writer.js';
import { ngramContainment, SIMILARITY_LIMITS } from '../modules/video-agent/similarity.js';
import { VIDEO_MAX_MINUTES, VIDEO_MIN_MINUTES } from '../modules/video-agent/video-agent.types.js';
import { findSourceTitleCopy } from '../modules/video-production/shared/meta/title-guard.js';
import { listUpcomingRemakeSources } from '../modules/script-remake/remake-queue.js';
import { findReadyScript, hashScript, type ReadyScriptCheck } from '../modules/script-remake/remake-ready.js';
import {
  applyNarrationReadings,
  findRiskyTerms,
  readNarrationReadings,
  removeNarrationReading,
  upsertNarrationReading,
} from '../modules/voice/narration-readings.js';
import { voicevoxReading } from '../infrastructure/tts/voicevox.client.js';
import { isTopicOnlySource, sourceTypeName } from '../modules/brains/psy-clusters.js';
import { trendVideoSourceType } from '../modules/radar/radar-trends.js';
import { resolveVoicevoxDefaultSpeaker } from '../infrastructure/tts/voice-settings.store.js';

/** Narration pace the app plans with (measured on our VOICEVOX narration). */
const CHARS_PER_MIN = NARRATION_CHARS_PER_MIN;
const SOURCES_DIR = path.join(paths.dataDir, 'script-skill', 'sources');
const REPO_ROOT = path.resolve(paths.dataDir, '../..');
const SCRIPTS_DIR = path.join(REPO_ROOT, 'docs', 'scripts');
/** Characters VOICEVOX reads badly or aloud. Quotes 「」『』 are fine. */
const UNREADABLE = /[()（）【】［］[\]{}<>＜＞*#＊♪★☆※…]|https?:/;
const LONG_SENTENCE = 70;
/** 二〇〇三年, 五〇〇〇円: numerals the shared chapter check takes for the placeholder 〇〇. */
const KANJI_NUMBER = /[一二三四五六七八九十百千〇]*[一二三四五六七八九][一二三四五六七八九十百千〇]*/g;
const hasPlaceholder = (text: string) => /[〇○◯]{2}|××|ＸＸ|△△/.test(text.replace(KANJI_NUMBER, ''));
/** Overlap with an older script of ours (8-grams, %) above which the two read as the same video. */
const OWN_REUSE_LIMIT = 8;

const rel = (file: string) => path.relative(REPO_ROOT, file).replaceAll('\\', '/');

function parseArgs(argv: string[]) {
  const flags: Record<string, string[]> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--part' || arg === '--save' || arg === '--json') flags[arg.slice(2)] = ['1'];
    else if (arg.startsWith('--')) (flags[arg.slice(2)] ??= []).push(argv[(i += 1)] ?? '');
    else rest.push(arg);
  }
  return { flags, rest };
}

function videoIdOf(input: string): string {
  const id = /^[\w-]{11}$/.test(input) ? input : extractYoutubeVideoId(input);
  if (!id) throw new Error(`Không phải link hay id YouTube: ${input}`);
  return id;
}

interface SourceInfo {
  videoId: string;
  url: string;
  title: string;
  channel: string;
  channelId: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  uploadDate: string | null;
  minutes: number | null;
  viewsPerHour: number | null;
  description: string;
  transcriptLanguage: string;
  transcriptChars: number;
  fetchedAt: string;
}

async function fetchInfo(videoId: string, url: string): Promise<Omit<SourceInfo, 'transcriptLanguage' | 'transcriptChars'>> {
  const raw = (await youtubeDl(url, { ...getYoutubeDlCommonOptions(), dumpSingleJson: true, skipDownload: true, noWarnings: true })) as unknown;
  const data = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, any>;
  const date = typeof data.upload_date === 'string' ? data.upload_date : '';
  const publishedAt = typeof data.timestamp === 'number' ? data.timestamp * 1000 : date ? Date.parse(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`) : NaN;
  const hours = Number.isFinite(publishedAt) ? Math.max(1, (Date.now() - publishedAt) / 3_600_000) : null;
  const views = typeof data.view_count === 'number' ? data.view_count : null;
  return {
    videoId,
    url,
    title: String(data.title ?? ''),
    channel: String(data.channel ?? data.uploader ?? ''),
    channelId: String(data.channel_id ?? ''),
    views,
    likes: typeof data.like_count === 'number' ? data.like_count : null,
    comments: typeof data.comment_count === 'number' ? data.comment_count : null,
    uploadDate: Number.isFinite(publishedAt) ? new Date(publishedAt).toISOString().slice(0, 10) : null,
    minutes: typeof data.duration === 'number' ? Math.round((data.duration / 60) * 10) / 10 : null,
    viewsPerHour: views !== null && hours ? Math.round(views / hours) : null,
    description: String(data.description ?? '').slice(0, 1500),
    fetchedAt: new Date().toISOString(),
  };
}

async function source(inputs: string[], flags: Record<string, string[]>) {
  if (!inputs.length) throw new Error('Cần ít nhất một link video');
  const preferred = (flags.lang?.[0] ?? 'ja') as TranscriptLanguage;
  const languages = [...new Set<TranscriptLanguage>([preferred, 'ja', 'en', 'ko', 'es'])];
  let failed = 0;
  for (const input of inputs) {
    const videoId = videoIdOf(input);
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const dir = path.join(SOURCES_DIR, videoId);
    fs.mkdirSync(dir, { recursive: true });
    console.log(`\n### ${videoId}`);
    let info: Awaited<ReturnType<typeof fetchInfo>> | null = null;
    try {
      info = await fetchInfo(videoId, url);
    } catch (err) {
      console.log(`⚠ Không đọc được thông tin video: ${(err as Error).message.slice(0, 200)}`);
    }
    let text = '';
    let language = '';
    const errors: string[] = [];
    for (const lang of languages) {
      try {
        const vtt = await downloadYoutubeTranscript(url, dir, lang);
        text = transcriptToPlainText(fs.readFileSync(await cleanSrt(vtt), 'utf8'));
        if (text.length > 200) {
          language = lang;
          break;
        }
      } catch (err) {
        errors.push(`${lang}: ${(err as Error).message.slice(0, 120)}`);
      }
    }
    if (!language) {
      failed += 1;
      console.log(`✗ Không có transcript (${errors.join(' | ')}). Video này không dùng làm nguồn được.`);
      continue;
    }
    const file = path.join(dir, 'transcript.txt');
    fs.writeFileSync(file, text, 'utf8');
    const record: SourceInfo = {
      ...(info ?? { videoId, url, title: '', channel: '', channelId: '', views: null, likes: null, comments: null, uploadDate: null, minutes: null, viewsPerHour: null, description: '', fetchedAt: new Date().toISOString() }),
      transcriptLanguage: language,
      transcriptChars: text.length,
    };
    fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify(record, null, 2), 'utf8');
    const { description, ...shown } = record;
    console.log(JSON.stringify(shown, null, 1));
    if (description) console.log(`mô tả: ${description.replace(/\s+/g, ' ').slice(0, 400)}`);
    const sourceType = trendVideoSourceType(videoId);
    if (sourceType) {
      console.log(`loại nguồn (bộ não săn xu hướng): ${sourceType} — ${sourceTypeName(sourceType)}${isTopicOnlySource(sourceType) ? ' ⚠ CHỈ mượn chủ đề (xem bước 1 của skill remake)' : ''}`);
    } else {
      console.log('loại nguồn: chưa gắn — tự xác định (narrated / manga / real-host / real-vlog / persona)');
    }
    console.log(`transcript: ${file.replaceAll('\\', '/')}`);
    if (language !== preferred) console.log(`⚠ Transcript là tiếng ${language}, không có tiếng ${preferred}.`);
  }
  if (failed === inputs.length) process.exitCode = 1;
}

interface ScriptMeta {
  title?: string;
  cluster?: string;
  topic?: string;
  topicKey?: string;
  mode?: string;
  sources?: string[];
  date?: string;
}

function ownScripts(): Array<{ file: string; meta: ScriptMeta | null }> {
  const found: Array<{ file: string; meta: ScriptMeta | null }> = [];
  const walk = (dir: string, depth: number) => {
    if (!fs.existsSync(dir) || depth < 0) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), depth - 1);
    }
    const file = path.join(dir, 'script.txt');
    if (!fs.existsSync(file)) return;
    let meta: ScriptMeta | null = null;
    try {
      meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')) as ScriptMeta;
    } catch {
      // scripts written by the app have no meta.json
    }
    found.push({ file, meta });
  };
  walk(SCRIPTS_DIR, 3);
  walk(paths.youtubeChannelsDir, 3);
  return found;
}

const titleOf = (text: string) => /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? '';

function list(flags: Record<string, string[]>) {
  const cluster = flags.cluster?.[0]?.toUpperCase();
  const rows = ownScripts().filter(s => !cluster || s.meta?.cluster?.toUpperCase().startsWith(cluster));
  for (const { file, meta } of rows) {
    const title = meta?.title ?? titleOf(fs.readFileSync(file, 'utf8'));
    console.log([meta?.date ?? '-', meta?.cluster ?? '-', meta?.mode ?? 'app', meta?.topicKey ?? '-', title, meta?.sources?.length ? `nguồn: ${meta.sources.join(', ')}` : '', rel(file)].filter(Boolean).join(' | '));
  }
  console.log(`${rows.length} kịch bản${cluster ? ` của ${cluster}` : ''}.`);
}

function parseScript(text: string): { title: string; chapters: Array<{ heading: string; sentences: string[] }> } {
  const raw: Array<{ heading: string; lines: string[] }> = [];
  let title = '';
  for (const line of text.split(/\r?\n/)) {
    const titleMatch = /^#\s+(.+)$/.exec(line);
    const headingMatch = /^##\s*(?:\d+[.)]\s*)?(.+)$/.exec(line);
    if (headingMatch) raw.push({ heading: headingMatch[1].trim(), lines: [] });
    else if (titleMatch) title = titleMatch[1].trim();
    else if (line.trim()) {
      if (!raw.length) raw.push({ heading: '(trước chương 1)', lines: [] });
      raw[raw.length - 1].lines.push(line);
    }
  }
  return { title, chapters: raw.map(c => ({ heading: c.heading, sentences: splitSentences(c.lines.join('\n')) })).filter(c => c.sentences.length) };
}

const SUBSCRIBE_ASK = /チャンネル登録/;
const COMMENT_ASK = /コメント(で|欄|に|を)/;
const LIKE_OR_BELL_ASK = /高評価|グッドボタン|いいねボタン|通知(ベル|をオン)|ベルマーク/;

/**
 * Viewers of these channels mostly leave around 30%, so a subscribe ask only at the end reaches few of them.
 * Niche outliers ask once softly after the first payoff (10–25%), ask a one-word comment question mid-video
 * (40–65%), and close with both. Warnings only: the app's own check does not require this.
 */
function ctaWarnings(chapters: Array<{ sentences: string[] }>): string[] {
  const sentences = chapters.flatMap(c => c.sentences);
  const total = sentences.reduce((sum, s) => sum + s.length, 0);
  if (!total || chapters.length < 3) return [];
  let at = 0;
  const marks = sentences.map(sentence => {
    const start = at;
    at += sentence.length;
    return { sentence, pct: (start / total) * 100, sec: (start / CHARS_PER_MIN) * 60 };
  });
  const pct = (value: number) => `${Math.round(value)}%`;
  const subscribe = marks.filter(m => SUBSCRIBE_ASK.test(m.sentence));
  const comment = marks.filter(m => COMMENT_ASK.test(m.sentence));
  const warnings: string[] = [];
  const early = subscribe.filter(m => m.pct < 90);
  if (!early.some(m => m.pct >= 5 && m.pct <= 35)) {
    warnings.push(
      `lời mời: chưa có câu mời đăng ký nhẹ ở cuối chương 1 (10–35% video)${early.length ? `; đang có ở ${early.map(m => pct(m.pct)).join(', ')}` : ''}`,
    );
  }
  for (const m of subscribe.filter(m => m.sec < 45)) warnings.push(`lời mời: mời đăng ký trong 45 giây đầu (「${m.sentence.slice(0, 30)}」)`);
  if (early.length > 1) warnings.push(`lời mời: mời đăng ký ${early.length} lần trước đoạn kết, chỉ nên 1 lần`);
  if (!comment.some(m => m.pct >= 35 && m.pct <= 70)) warnings.push('lời mời: chưa có câu hỏi bình luận giữa video (35–70%), trả lời được bằng một từ hoặc một con số');
  if (!subscribe.some(m => m.pct >= 85)) warnings.push('lời mời: đoạn kết thiếu lời mời đăng ký ngắn');
  if (!comment.some(m => m.pct >= 85)) warnings.push('lời mời: đoạn kết thiếu câu hỏi bình luận');
  for (const m of marks.filter(m => LIKE_OR_BELL_ASK.test(m.sentence))) {
    warnings.push(`lời mời: không xin bấm thích / bật chuông (「${m.sentence.slice(0, 30)}」, ${pct(m.pct)})`);
  }
  return warnings;
}

function check(args: string[], flags: Record<string, string[]>) {
  const file = args[0] ? path.resolve(args[0]) : '';
  if (!file || !fs.existsSync(file)) throw new Error(`Không có file kịch bản: ${args[0] ?? ''}`);
  const text = fs.readFileSync(file, 'utf8');
  const { title, chapters } = parseScript(text);
  if (!chapters.length) throw new Error('Kịch bản trống hoặc sai định dạng (cần "# title" và "## 1. …").');
  const part = Boolean(flags.part);
  const narration = chapters.map(c => c.sentences.join('')).join('\n');
  const totalChars = chapters.reduce((sum, c) => sum + c.sentences.join('').length, 0);
  const estimated = Math.round((totalChars / CHARS_PER_MIN) * 10) / 10;
  const minutes = flags.minutes?.[0] ? Number(flags.minutes[0]) : Math.max(VIDEO_MIN_MINUTES, Math.min(VIDEO_MAX_MINUTES, Math.round(estimated)));
  const sources = (flags.source ?? []).map(input => {
    const id = videoIdOf(input);
    const dir = path.join(SOURCES_DIR, id);
    const transcript = path.join(dir, 'transcript.txt');
    if (!fs.existsSync(transcript)) throw new Error(`Chưa lấy nguồn ${id}: chạy \`source ${id}\` trước.`);
    let sourceTitle = '';
    try {
      sourceTitle = (JSON.parse(fs.readFileSync(path.join(dir, 'info.json'), 'utf8')) as SourceInfo).title;
    } catch {
      // title stays empty: only the wording is compared
    }
    return { id, title: sourceTitle, text: fs.readFileSync(transcript, 'utf8') };
  });

  const blocking: string[] = [];
  const warnings: string[] = [];
  if (!title) blocking.push('thiếu dòng "# title"');
  if (!part) {
    blocking.push(...validateLength(minutes, chapters.length));
    if (estimated < VIDEO_MIN_MINUTES) blocking.push(`kịch bản chỉ khoảng ${estimated} phút, dưới ${VIDEO_MIN_MINUTES} phút`);
    if (estimated > VIDEO_MAX_MINUTES) blocking.push(`kịch bản khoảng ${estimated} phút, trên ${VIDEO_MAX_MINUTES} phút`);
    if (Math.abs(estimated - minutes) / minutes > 0.15) warnings.push(`dự định ${minutes} phút nhưng kịch bản khoảng ${estimated} phút`);
  }

  // When only part is written, chapters are judged against each other, not against the planned total.
  const targetChars = part ? Math.round(totalChars / chapters.length) : Math.round((minutes * CHARS_PER_MIN) / chapters.length);
  console.log(`«${title}» — ${chapters.length} chương, ${totalChars} ký tự, khoảng ${estimated} phút${part ? ' (chưa xong)' : ` (dự định ${minutes})`}`);
  for (const [index, chapter] of chapters.entries()) {
    const problems = chapterProblems({ sentences: chapter.sentences, previous: chapters.slice(0, index).map(c => c.sentences), targetChars }).filter(
      problem => !problem.startsWith('〇〇') || hasPlaceholder(chapter.sentences.join('')),
    );
    for (const source of sources) {
      const copied = sourceCopiedSentences(chapter.sentences, source.text);
      if (copied.length) problems.push(`giống câu của nguồn ${source.id}: ${copied.slice(0, 4).map(s => `「${s}」`).join('')}${copied.length > 4 ? ` (+${copied.length - 4})` : ''}`);
    }
    const unreadable = chapter.sentences.filter(s => UNREADABLE.test(s));
    if (unreadable.length) problems.push(`ký hiệu khó đọc thành tiếng: ${unreadable.slice(0, 3).map(s => `「${s}」`).join('')}`);
    const long = chapter.sentences.filter(s => s.length > LONG_SENTENCE);
    if (long.length) warnings.push(`chương ${index + 1}: ${long.length} câu dài hơn ${LONG_SENTENCE} ký tự`);
    console.log(`${problems.length ? '✗' : '✓'} ${index + 1}. ${chapter.heading} — ${chapter.sentences.join('').length} ký tự (mục tiêu ~${targetChars})`);
    for (const problem of problems) {
      console.log(`    - ${problem}`);
      blocking.push(`chương ${index + 1}: ${problem.slice(0, 80)}`);
    }
  }

  const similarity: ReadyScriptCheck['sources'] = [];
  for (const source of sources) {
    const gram8 = ngramContainment(narration, source.text, 8);
    const gram15 = ngramContainment(narration, source.text, 15);
    const bad = gram8 > SIMILARITY_LIMITS.gram8 || gram15 > SIMILARITY_LIMITS.gram15;
    similarity.push({ id: source.id, gram8, gram15 });
    console.log(`${bad ? '✗' : '✓'} độ giống nguồn ${source.id}: 8-gram ${gram8}% (≤${SIMILARITY_LIMITS.gram8}), 15-gram ${gram15}% (≤${SIMILARITY_LIMITS.gram15})`);
    if (bad) blocking.push(`quá giống nguồn ${source.id}`);
    const kept = source.title ? findSourceTitleCopy(title, source.title) : undefined;
    if (kept) blocking.push(`title giữ gần nguyên title nguồn 「${source.title}」 (${Math.round(kept.containment * 100)}%)`);
  }
  for (const own of ownScripts()) {
    if (path.resolve(own.file) === file) continue;
    const overlap = ngramContainment(narration, fs.readFileSync(own.file, 'utf8'), 8);
    if (overlap > OWN_REUSE_LIMIT) {
      console.log(`✗ giống kịch bản đã có ${overlap}%: ${rel(own.file)}`);
      blocking.push(`giống kịch bản đã có ${rel(own.file)} (${overlap}%)`);
    }
  }
  if (!part) warnings.push(...ctaWarnings(chapters));
  for (const warning of warnings) console.log(`⚠ ${warning}`);
  const risky = new Set(chapters.flatMap(c => c.sentences.flatMap(s => findRiskyTerms(s).map(term => term.text))));
  if (risky.size) console.log(`ℹ ${risky.size} từ nên kiểm cách đọc (số, tên riêng, chữ Latin): chạy \`script readings ${rel(file)}\``);
  console.log(blocking.length ? `\nCHƯA ĐẠT: ${blocking.length} vấn đề.` : '\nĐẠT.');
  if (flags.save) {
    if (part) throw new Error('--save chỉ dùng khi kịch bản đã viết xong (không kèm --part).');
    const record: ReadyScriptCheck = {
      passed: blocking.length === 0,
      checkedAt: new Date().toISOString(),
      scriptHash: hashScript(text),
      chapters: chapters.length,
      chars: totalChars,
      estimatedMinutes: estimated,
      sources: similarity,
      problems: blocking,
    };
    const out = path.join(path.dirname(file), 'check.json');
    fs.writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    console.log(`Đã lưu ${rel(out)}`);
  }
  if (blocking.length) process.exitCode = 1;
}

/** Next source videos each remake channel will prepare, and whether a usable ready script exists. */
function queue(flags: Record<string, string[]>) {
  const limit = Math.max(1, Number(flags.limit?.[0] ?? 3) || 3);
  const channels = listUpcomingRemakeSources({ ...(flags.channel?.[0] ? { channelId: flags.channel[0] } : {}), limit });
  const withStatus = channels.map(channel => ({
    ...channel,
    videos: channel.videos.map(video => {
      const ready = findReadyScript(channel.channelId, video.id);
      return { ...video, ready: ready.status, ...(ready.status === 'ready' ? {} : { reason: ready.reason }), dir: rel(ready.dir) };
    }),
  }));
  if (flags.json) {
    console.log(JSON.stringify(withStatus, null, 2));
    return;
  }
  for (const channel of withStatus) {
    const head = [`${channel.channelName} (${channel.channelId})`, `niche: ${channel.niche || '-'}`, channel.note];
    console.log(`\n### ${head.filter(Boolean).join(' · ')}`);
    for (const video of channel.videos) {
      const mark = video.ready === 'ready' ? '✓ sẵn sàng' : `✗ ${video.ready}: ${video.reason}`;
      console.log(`- ${video.id} | ${video.title} | ${mark} | ${video.dir}`);
    }
  }
  const all = withStatus.flatMap(channel => channel.videos);
  const todo = all.filter(video => video.ready !== 'ready').length;
  console.log(`\n${withStatus.length} kênh remake, ${all.length} video sắp làm, ${todo} cần viết.`);
}

/** Each number, name and Latin word of the script once, with how VOICEVOX reads its first sentence. */
async function readings(args: string[], flags: Record<string, string[]>) {
  const file = args[0] ? path.resolve(args[0]) : '';
  if (!file || !fs.existsSync(file)) throw new Error(`Không có file kịch bản: ${args[0] ?? ''}`);
  const { chapters } = parseScript(fs.readFileSync(file, 'utf8'));
  const speaker = Number(flags.speaker?.[0] ?? resolveVoicevoxDefaultSpeaker());
  const dictionary = readNarrationReadings();
  const terms = new Map<string, { kind: string; count: number; sentence: string }>();
  for (const sentence of chapters.flatMap(c => c.sentences)) {
    for (const term of findRiskyTerms(sentence, dictionary)) {
      const seen = terms.get(term.text);
      if (seen) seen.count += 1;
      else terms.set(term.text, { kind: term.kind, count: 1, sentence });
    }
  }
  if (!terms.size) {
    console.log('Không có số, tên riêng hay chữ Latin cần kiểm.');
    return;
  }
  let engine = true;
  for (const [term, info] of terms) {
    let kana = '';
    if (engine) {
      try {
        kana = await voicevoxReading(applyNarrationReadings(info.sentence, dictionary), speaker);
      } catch {
        engine = false;
        console.log('⚠ VOICEVOX chưa mở: chỉ liệt kê từ, chưa có cách đọc.\n');
      }
    }
    console.log(`${term}  (${info.kind}, ${info.count} câu)\n  ${info.sentence}${kana ? `\n  → ${kana}` : ''}`);
  }
  console.log(
    `\n${terms.size} từ. Đọc sai thì thêm vào từ điển: npm run -s script -- dict add <chữ> <カタカナ> (chỉ đổi tiếng, không đổi kịch bản và phụ đề).`,
  );
}

function dict(args: string[], flags: Record<string, string[]>) {
  const [action = 'list', surface, reading] = args;
  if (action === 'add') {
    if (!surface || !reading) throw new Error('Cách dùng: script dict add <chữ> <カタカナ> [--note …]');
    if (!/^[\p{Script=Katakana}\p{Script=Hiragana}ー・、。\s]+$/u.test(reading)) {
      throw new Error('Cách đọc phải viết bằng katakana hoặc hiragana.');
    }
    upsertNarrationReading({ surface, reading, note: flags.note?.[0] });
    console.log(`Đã thêm: ${surface} → ${reading}`);
    return;
  }
  if (action === 'rm') {
    if (!surface) throw new Error('Cách dùng: script dict rm <chữ>');
    removeNarrationReading(surface);
    console.log(`Đã xoá: ${surface}`);
    return;
  }
  const entries = readNarrationReadings();
  for (const entry of entries) console.log(`${entry.surface} → ${entry.reading}${entry.note ? `  (${entry.note})` : ''}`);
  console.log(`${entries.length} từ trong từ điển cách đọc.`);
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  const { flags, rest } = parseArgs(argv);
  if (command === 'source') return source(rest, flags);
  if (command === 'list') return list(flags);
  if (command === 'check') return check(rest, flags);
  if (command === 'queue') return queue(flags);
  if (command === 'readings') return readings(rest, flags);
  if (command === 'dict') return dict(rest, flags);
  throw new Error(
    'Usage: script source <url>... [--lang ja] | list [--cluster K3] | check <script.txt> [--minutes N] [--source <videoId>]... [--part] [--save] | queue [--channel id] [--limit N] [--json] | readings <script.txt> [--speaker N] | dict [list | add <chữ> <カタカナ> | rm <chữ>]',
  );
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
