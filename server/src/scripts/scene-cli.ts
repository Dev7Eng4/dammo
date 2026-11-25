/**
 * Scene split skill (jp-psy-scene-split): Claude cuts the transcript into scenes by meaning and writes the
 * image prompts; this CLI gives it the material, checks the plan with the app's own rules, swaps it into the
 * video and asks the running server to draw the images (the server owns the Flow / Meta browser profiles).
 *
 *   npm run -s scene -- scan [channel|video] [--json]
 *   npm run -s scene -- info <video>
 *   npm run -s scene -- check <video> [plan.json]
 *   npm run -s scene -- apply <video> [plan.json]
 *   npm run -s scene -- draw <video>
 *   npm run -s scene -- restore <video>
 *
 * Not imported by main.ts: editing it never restarts the server.
 */
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { paths, youtubeChannelDir } from '../config/paths.js';
import { createYoutubeProductionDestination } from '../modules/video-production/adapters/youtube-production-destination.adapter.js';
import { promptsRepository } from '../modules/prompts/prompts.repository.js';
import { executePromptTemplate } from '../modules/prompts/prompts.file-store.js';
import { srtTimestampToMs } from '../infrastructure/subtitle/srt-utils.js';
import { loadTranscriptCuesFromSrt } from '../modules/video-production/shared/ai-video/ai-video-transcript.js';
import { tryParseAiVideoSceneResponse } from '../modules/video-production/shared/ai-video/ai-video-scene-response.js';
import { buildAiScenePromptsFile, findOverlappingScenes } from '../modules/video-production/shared/ai-video/ai-video-scene-prompts-store.js';
import { FALLBACK_MASCOT_PROFILE, findMascotScenePromptIssue } from '../modules/video-production/shared/ai-video/ai-video-mascot-profile.js';
import { resolveChannelMascotImagePath } from '../modules/video-production/shared/ai-video/ai-video-channel-mascots.js';
import {
  AI_SCENE_PROMPTS_FILENAME,
  AI_SLIDES_DIRNAME,
  AI_VIDEOS_DIRNAME,
  CHARACTER_REFERENCES_FILENAME,
  MASCOT_SCENES_PROMPT_KEY,
  VIDEO_IMAGE_PROMPT_KEY,
  VIDEO_IMAGE_WITH_REFERENCE_PROMPT_KEY,
} from '../modules/video-production/shared/ai-video/ai-video.constants.js';
import type { AiVideoScenePrompt, TranscriptCue } from '../modules/video-production/shared/ai-video/ai-video.types.js';
import { videoPrepareRepository } from '../modules/youtube-channels/video-prepare.repository.js';
import { youtubeChannelsRepository } from '../modules/youtube-channels/youtube-channels.repository.js';
import type { YoutubeChannel } from '../modules/youtube-channels/youtube-channels.types.js';
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
  type Timed,
  type VideoRef,
  writeJson,
} from './lib/production-video.js';

// ---------- pacing rules (seconds on screen, after audio speed) ----------
/** Each band: scenes starting before `untilSec` must stay within [min, max]. */
const PACE = [
  { untilSec: 30, min: 2.5, max: 6, label: 'mở đầu (0–30 giây)' },
  { untilSec: 180, min: 3, max: 8, label: '30 giây – 3 phút' },
  { untilSec: 600, min: 4, max: 12, label: '3–10 phút' },
  { untilSec: Infinity, min: 5, max: 15, label: 'sau phút 10' },
] as const;
/** A scene marked `hold` (a quiet, emotional beat) may run this long. */
const HOLD_MAX_SEC = 18;
/** At most this share of image scenes may be `hold`. */
const HOLD_MAX_SHARE = 0.1;
/** Below this a scene is a flash the eye cannot read: always an error. */
const HARD_MIN_SEC = 2;
/** Adjacent scene descriptions sharing this many words look like one picture twice. */
const SAME_PICTURE_JACCARD = 0.75;

const STATE_FILE = 'scene-split.json';
const BACKUP_DIR = 'scene-backup';
/** Files of the old scene set: moved together so the app never mixes old images with new timings. */
const SCENE_ARTIFACTS = [AI_SCENE_PROMPTS_FILENAME, AI_SLIDES_DIRNAME, AI_VIDEOS_DIRNAME, 'scenes-with-images.json', 'scenes-timing.srt'];
const WORK_ROOT = path.join(paths.dataDir, 'scene-skill');

// ---------- small helpers ----------
const quantile = (values: number[], q: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(q * (sorted.length - 1))]!;
};
const argv = process.argv.slice(2);
const has = (name: string) => argv.includes(`--${name}`);
// A video id may start with one "-", so only "--" marks a flag.
const positional = argv.filter(arg => !arg.startsWith('--'));
const [command, target, extra] = positional;
/** Narration cue that closes a sentence (●) or a clause (○): clean places to change the picture. */
const SENTENCE_END = /[。！？!?」』）)…]$/;
const CLAUSE_END = /[、，,]$/;
const cueText = (cue: TranscriptCue) => cue.text.replace(/\s+/g, '');
const endsSentence = (cue: TranscriptCue) => SENTENCE_END.test(cueText(cue));
const endsClause = (cue: TranscriptCue) => endsSentence(cue) || CLAUSE_END.test(cueText(cue));
const boundaryMark = (cue: TranscriptCue) => (endsSentence(cue) ? ' ●' : CLAUSE_END.test(cueText(cue)) ? ' ○' : '');

function band(startSec: number) {
  return PACE.find(entry => startSec < entry.untilSec)!;
}

function paceStats(timed: Timed[]) {
  const shown = timed.map(entry => entry.shownSec);
  const body = timed.filter(entry => entry.startSec >= 180).map(entry => entry.shownSec);
  return {
    scenes: timed.length,
    median: r1(quantile(shown, 0.5)),
    p90: r1(quantile(shown, 0.9)),
    bodyMedian: r1(quantile(body, 0.5)),
    over12: timed.length ? Math.round((shown.filter(sec => sec > 12).length / timed.length) * 100) : 0,
    longest: r1(Math.max(0, ...shown)),
  };
}

// ---------- prompt flow (same choice as scene-assets.step + withChannelMascot) ----------
interface Flow {
  mode: 'plain' | 'mascot' | 'reference';
  key: string;
  setName: string;
  rules: string;
  /** Fixed text the plan writes as {{NAME}}; `required` blocks must be in every image prompt. */
  blocks: Array<{ name: string; text: string; required: boolean }>;
  forbidden: string[];
  characters: Array<{ id: string; name?: string; description?: string }>;
}

const TRANSCRIPT_PLACEHOLDER = '(transcript: xem cues.txt, đã đánh số từng câu)';
const DURATION_PLACEHOLDER = '«theo luật nhịp của skill, không theo số này»';

async function resolveFlow(ref: VideoRef): Promise<Flow> {
  const destination = await createYoutubeProductionDestination(ref.channel);
  if (!destination.visualStyle) fail('Kênh chưa chọn phong cách hình (reupAudioVisualStyleId): app cũng không tạo cảnh được.');
  const niche = readJson(path.join(ref.dir, 'video-meta.json'))?.detected_niche?.trim?.() ?? '';
  const style = destination.visualStyle!.rule;
  const mascotImage = await resolveChannelMascotImagePath(ref.channel.id);
  const flowSet = promptsRepository.findImageSceneFlow(destination.niche, destination.useReferenceImage === true);

  let mode: Flow['mode'] = 'plain';
  let key = flowSet?.mode === 'plain' ? flowSet.stepKeys[0]! : VIDEO_IMAGE_PROMPT_KEY;
  let args: unknown[] = [TRANSCRIPT_PLACEHOLDER, style, niche, DURATION_PLACEHOLDER];
  let characters: Flow['characters'] = [];
  const extraBlocks: Flow['blocks'] = [];

  if (mascotImage) {
    mode = 'mascot';
    key = MASCOT_SCENES_PROMPT_KEY;
    const stored = readJson(path.join(youtubeChannelDir(ref.channel.id), 'mascot-profile.json'));
    const profile = stored?.profile?.identityPhrase ? stored.profile : FALLBACK_MASCOT_PROFILE;
    args = [...args, profile];
    // mascot_scenes formula: [identity] + … + [style] + this tail.
    const styleText = String(profile.styleRule).replace(/[.\s]+$/, '');
    extraBlocks.push(
      { name: 'MASCOT', text: profile.identityPhrase, required: false },
      { name: 'STYLE', text: `${styleText}, single illustration, one scene, no text, no character sheet, no multiple poses of the same character`, required: true },
    );
  } else if (destination.useReferenceImage) {
    mode = 'reference';
    key = flowSet?.mode === 'reference' ? flowSet.stepKeys[1]! : VIDEO_IMAGE_WITH_REFERENCE_PROMPT_KEY;
    const stored = readJson(path.join(ref.dir, CHARACTER_REFERENCES_FILENAME));
    const list: any[] = Array.isArray(stored) ? stored : (stored?.characters ?? []);
    characters = list.filter(item => typeof item?.id === 'string').map(item => ({ id: item.id, name: item.name, description: item.description }));
    if (characters.length === 0) fail(`Kênh dùng ảnh tham chiếu nhưng video chưa có ${CHARACTER_REFERENCES_FILENAME}: tạo video bằng app trước.`);
    args = [...args, JSON.stringify(characters)];
  }

  const rules = await executePromptTemplate(destination.language, key, args);
  const blocks = [...rules.matchAll(/^([A-Z][A-Z ]*BLOCK)[^\n]*nguyên văn[^\n]*:\s*\n\s*"([^"]+)"/gm)].map(match => ({ name: match[1]!.trim(), text: match[2]!.trim(), required: true }));
  blocks.push(...extraBlocks);
  const forbiddenLine = /TỪ CẤM[^\n]*\n([^\n]+)/.exec(rules)?.[1] ?? '';
  const forbidden = forbiddenLine
    .split(/[,.]/)
    .map(word => word.trim().toLowerCase())
    .filter(word => /^[a-z0-9][a-z0-9 -]*$/.test(word));
  return { mode, key, setName: mascotImage ? 'mascot' : (flowSet?.setName ?? 'default'), rules, blocks, forbidden, characters };
}

// ---------- plan ----------
interface PlanScene {
  from: number;
  to: number;
  prompt?: string;
  title?: string;
  hold?: boolean;
  beat?: string;
  references?: string[];
}

function workDir(ref: VideoRef) {
  return path.join(WORK_ROOT, ref.channel.id, ref.videoId);
}

/** plan.json, or plan-01.json, plan-02.json… joined in name order (long videos are written in parts). */
function planFiles(ref: VideoRef, file: string | undefined): string[] {
  if (file) return [path.resolve(file)];
  const dir = workDir(ref);
  if (fs.existsSync(path.join(dir, 'plan.json'))) return [path.join(dir, 'plan.json')];
  const parts = fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => /^plan-\d+\.json$/.test(name)).sort() : [];
  if (parts.length === 0) fail(`Chưa có kế hoạch: ${path.join(dir, 'plan.json')} (hoặc plan-01.json, plan-02.json…)`);
  return parts.map(name => path.join(dir, name));
}

function loadPlan(ref: VideoRef, file: string | undefined): PlanScene[] {
  const scenes: PlanScene[] = [];
  for (const planFile of planFiles(ref, file)) {
    const data = readJson(planFile);
    if (!data) fail(`Không đọc được kế hoạch (JSON hỏng?): ${planFile}`);
    const list = Array.isArray(data) ? data : data.scenes;
    if (!Array.isArray(list)) fail(`Kế hoạch không có "scenes": ${planFile}`);
    scenes.push(...list);
  }
  if (scenes.length === 0) fail('Kế hoạch không có cảnh nào.');
  return scenes;
}

function expand(prompt: string, flow: Flow): string {
  let text = prompt;
  for (const block of flow.blocks) text = text.replaceAll(`{{${block.name}}}`, block.text);
  return text.replace(/\s+/g, ' ').trim();
}

function scenePart(prompt: string, flow: Flow): string {
  let text = prompt;
  for (const block of flow.blocks) text = text.replace(block.text, ' ');
  return text.trim();
}

const words = (text: string) => new Set(text.toLowerCase().match(/[a-z]+/g)?.filter(word => word.length > 3) ?? []);
function jaccard(a: Set<string>, b: Set<string>) {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.max(1, a.size + b.size - shared);
}

interface CheckResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  scenes: AiVideoScenePrompt[];
  stats: ReturnType<typeof paceStats>;
}

function checkPlan(plan: PlanScene[], cues: TranscriptCue[], flow: Flow, speed: number, partial = false): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const scenes: AiVideoScenePrompt[] = [];
  const at = (index: number) => `cảnh ${index + 1}`;

  // Coverage: every cue in exactly one scene, in order.
  let expected = 1;
  plan.forEach((scene, index) => {
    if (!Number.isInteger(scene.from) || !Number.isInteger(scene.to) || scene.from > scene.to) {
      errors.push(`${at(index)}: from/to không hợp lệ (${scene.from}–${scene.to})`);
      return;
    }
    if (scene.from !== expected) errors.push(`${at(index)}: bắt đầu ở câu ${scene.from}, phải là câu ${expected} (${scene.from > expected ? 'bỏ sót' : 'chồng'} câu)`);
    expected = scene.to + 1;
    if (scene.to > cues.length) errors.push(`${at(index)}: câu ${scene.to} vượt quá ${cues.length} câu`);
  });
  if (!partial && expected !== cues.length + 1 && expected <= cues.length) errors.push(`kế hoạch dừng ở câu ${expected - 1}, transcript có ${cues.length} câu`);
  if (errors.length) return { passed: false, errors, warnings, scenes, stats: paceStats([]) };

  const characterIds = new Set(flow.characters.map(item => item.id));
  plan.forEach((scene, index) => {
    const startTime = cues[scene.from - 1]!.startTime;
    const endTime = cues[scene.to - 1]!.endTime;
    if (scene.title !== undefined) {
      if (!scene.title.trim()) errors.push(`${at(index)}: cảnh tiêu đề thiếu chữ`);
      scenes.push({ type: 'title', title: scene.title.trim(), prompt: '', startTime, endTime, references: [] });
      return;
    }
    const prompt = expand(scene.prompt ?? '', flow);
    if (!prompt) {
      errors.push(`${at(index)}: thiếu prompt`);
      return;
    }
    if (/[぀-ヿ㐀-鿿]|[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(prompt)) errors.push(`${at(index)}: prompt phải viết tiếng Anh`);
    if (/\{\{[^}]+\}\}/.test(prompt)) errors.push(`${at(index)}: còn ${/\{\{[^}]+\}\}/.exec(prompt)![0]} chưa thay được (tên khối sai?)`);
    for (const block of flow.blocks) if (block.required && !prompt.includes(block.text)) errors.push(`${at(index)}: thiếu ${block.name} nguyên văn (viết {{${block.name}}})`);
    const part = scenePart(prompt, flow);
    const banned = flow.forbidden.find(word => new RegExp(`\\b${word.replace(/[-]/g, '\\-')}\\b`, 'i').test(part));
    if (banned) errors.push(`${at(index)}: phần cảnh dùng từ cấm "${banned}"`);
    const mascotBlock = flow.blocks.find(block => block.name === 'MASCOT');
    if (mascotBlock && prompt.includes(mascotBlock.text) && !prompt.startsWith(mascotBlock.text)) errors.push(`${at(index)}: cảnh có mascot phải BẮT ĐẦU bằng {{MASCOT}}`);
    if (mascotBlock && prompt.split(mascotBlock.text).length > 2) errors.push(`${at(index)}: mascot xuất hiện 2 lần trong một cảnh`);
    if (part.length < 120) warnings.push(`${at(index)}: phần mô tả cảnh ngắn (${part.length} ký tự), dễ ra ảnh chung chung`);
    const entry: AiVideoScenePrompt = { prompt, startTime, endTime };
    if (flow.mode === 'reference') {
      const refs = (scene.references ?? []).filter(id => characterIds.has(id));
      if (refs.length === 0) errors.push(`${at(index)}: luồng tham chiếu cần "references" là id nhân vật (${[...characterIds].join(', ')})`);
      const unknown = (scene.references ?? []).filter(id => !characterIds.has(id));
      if (unknown.length) errors.push(`${at(index)}: id nhân vật không có: ${unknown.join(', ')}`);
      entry.references = refs;
    }
    scenes.push(entry);
  });

  // The app's own parser must accept the result exactly as the LLM path would.
  const parsed = tryParseAiVideoSceneResponse({ content: JSON.stringify(scenes), codeBlocks: [] } as any, { requireReferences: flow.mode === 'reference' });
  if (!parsed && errors.length === 0) errors.push('bộ đọc cảnh của app không nhận kế hoạch này');
  for (const overlap of findOverlappingScenes(scenes)) errors.push(`${at(overlap.index)}: chồng giờ với cảnh trước`);

  if (flow.mode === 'mascot') {
    const issue = findMascotScenePromptIssue(scenes);
    if (issue) errors.push(`mascot: ${issue}`);
    // The app checks chunk by chunk; long stretches without the mascot fail there too.
    for (let i = 0; i + 10 <= scenes.length; i += 10) {
      const windowIssue = findMascotScenePromptIssue(scenes.slice(i, i + 10));
      if (windowIssue) warnings.push(`mascot, cảnh ${i + 1}–${i + 10}: ${windowIssue}`);
    }
  }

  // A picture changing mid-sentence reads as a jump cut.
  const midSentence = plan
    .map((scene, index) => ({ scene, index }))
    .filter(({ scene, index }) => index + 1 < plan.length && !endsClause(cues[scene.to - 1]!))
    .map(({ index }) => index + 1);
  // Subtitles cut into fragments with no punctuation give nothing to check against.
  const punctuated = cues.filter(endsClause).length / Math.max(1, cues.length);
  if (midSentence.length && punctuated > 0.3) {
    const share = midSentence.length / Math.max(1, plan.length - 1);
    const list = `${midSentence.slice(0, 15).join(', ')}${midSentence.length > 15 ? '…' : ''}`;
    if (share > 0.1) errors.push(`${midSentence.length} cảnh đổi ảnh giữa câu (câu cuối không có ● hay ○): ${list}`);
    else warnings.push(`${midSentence.length} cảnh đổi ảnh giữa câu, chỉ nên khi câu quá dài: ${list}`);
  }

  // Pacing. In a partial plan the last scene's length is unknown (the next scene is not written yet).
  const timed = onScreen(scenes, speed);
  if (partial && timed.length) timed.pop();
  const imageCount = scenes.filter(scene => scene.type !== 'title').length;
  const holds = plan.filter((scene, index) => scene.hold && scenes[index]?.type !== 'title').length;
  if (holds > Math.ceil(imageCount * HOLD_MAX_SHARE)) errors.push(`${holds} cảnh "hold", tối đa ${Math.ceil(imageCount * HOLD_MAX_SHARE)} (10%)`);
  timed.forEach((entry, index) => {
    const scene = plan[index]!;
    const rule = band(entry.startSec);
    const single = scene.from === scene.to;
    const where = `${at(index)} (${clock(entry.startSec)}, ${r1(entry.shownSec)}s)`;
    if (entry.shownSec < HARD_MIN_SEC) errors.push(`${where}: quá ngắn, gộp với câu bên cạnh`);
    else if (entry.shownSec < rule.min) warnings.push(`${where}: ngắn hơn ${rule.min}s của đoạn ${rule.label}`);
    const max = scene.hold && entry.startSec >= 30 ? HOLD_MAX_SEC : rule.max;
    if (entry.shownSec > max) {
      if (single) warnings.push(`${where}: một câu dài hơn ${max}s, không cắt giữa câu được; cân nhắc viết lại câu ngắn hơn`);
      else errors.push(`${where}: dài hơn ${max}s cho đoạn ${rule.label}${scene.hold ? ' (kể cả hold)' : ''}, tách thành 2–3 ảnh`);
    }
  });

  // Adjacent pictures that are really the same picture.
  for (let i = 1; i < scenes.length; i += 1) {
    if (scenes[i]!.type === 'title' || scenes[i - 1]!.type === 'title') continue;
    const score = jaccard(words(scenePart(scenes[i - 1]!.prompt, flow)), words(scenePart(scenes[i]!.prompt, flow)));
    if (score >= SAME_PICTURE_JACCARD) warnings.push(`${at(i)}: gần giống hệt cảnh trước (${Math.round(score * 100)}% từ chung), đổi bố cục / góc / biểu tượng`);
  }

  return { passed: errors.length === 0, errors, warnings, scenes, stats: paceStats(timed) };
}

function planHash(scenes: AiVideoScenePrompt[]): string {
  let hash = 0;
  const text = JSON.stringify(scenes);
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(16);
}

const post = (url: string) => serverRequest('POST', url);

// ---------- commands ----------
async function scan() {
  const refs = resolveScope(target);
  const rows = [];
  for (const ref of refs) {
    const file = readJson(path.join(ref.dir, AI_SCENE_PROMPTS_FILENAME));
    const scenes: any[] = file?.scenes ?? [];
    const state = readJson(path.join(ref.dir, STATE_FILE));
    // Done by this skill already: skipped unless asked (--force), like ctr_review.
    if (state?.status === 'drawn' && !has('force')) continue;
    const stats = paceStats(onScreen(scenes, audioSpeed(ref)));
    const missing = scenes.filter(scene => scene.type !== 'title' && !(scene.path && fs.existsSync(path.resolve(ref.dir, scene.path)))).length;
    rows.push({
      channel: ref.channel.name,
      channelId: ref.channel.id,
      videoId: ref.videoId,
      status: ref.status,
      title: ref.title,
      ...stats,
      missing,
      split: state?.status ?? (scenes.length ? 'app' : 'none'),
    });
  }
  rows.sort((a, b) => b.p90 - a.p90);
  if (has('json')) return console.log(JSON.stringify(rows, null, 2));
  console.log(`${rows.length} video (Prepared/Created). Cột: cảnh | trung vị s | p90 s | thân bài trung vị s | % cảnh >12s | dài nhất s | thiếu ảnh | trạng thái`);
  for (const row of rows) {
    console.log(
      [row.channel.slice(0, 14).padEnd(14), row.videoId.padEnd(11), row.status.padEnd(8), String(row.scenes).padStart(4), String(row.median).padStart(5), String(row.p90).padStart(5), String(row.bodyMedian).padStart(5), `${row.over12}%`.padStart(4), String(row.longest).padStart(5), String(row.missing).padStart(4), row.split.padEnd(8), row.title.slice(0, 40)].join(' | '),
    );
  }
}

async function info() {
  const ref = resolveVideo(target);
  const subtitle = subtitlePath(ref.dir);
  if (!subtitle) fail('Video chưa có transcript.srt / transcript-updated.srt.');
  const cues = await loadTranscriptCuesFromSrt(subtitle!);
  const speed = audioSpeed(ref);
  const flow = await resolveFlow(ref);
  const chapters = chapterStarts(ref.dir, cues);
  const out = workDir(ref);
  fs.mkdirSync(out, { recursive: true });

  const lines: string[] = [];
  cues.forEach((cue, index) => {
    const chapter = chapters.get(index);
    if (chapter) lines.push(`=== CHƯƠNG: ${chapter} ===`);
    const start = srtTimestampToMs(cue.startTime) / 1000 / speed;
    const length = (srtTimestampToMs(cue.endTime) - srtTimestampToMs(cue.startTime)) / 1000 / speed;
    lines.push(`#${index + 1} ${clock(start)} (${r1(length)}s) ${cue.text.replace(/\s+/g, ' ').trim()}${boundaryMark(cue)}`);
  });
  fs.writeFileSync(path.join(out, 'cues.txt'), `${lines.join('\n')}\n`, 'utf8');

  const blockList = flow.blocks.map(block => `- \`{{${block.name}}}\`${block.required ? ' (bắt buộc ở mọi cảnh ảnh)' : ' (khi cảnh có nhân vật này)'} = "${block.text}"`).join('\n');
  const characterList = flow.characters.map(item => `- \`${item.id}\`: ${item.name ?? ''} ${item.description ? `— ${item.description.slice(0, 160)}` : ''}`).join('\n');
  fs.writeFileSync(
    path.join(out, 'rules.md'),
    [
      `# Luật hình của kênh ${ref.channel.name}`,
      `Luồng: ${flow.mode} · prompt \`${flow.key}\` (bộ "${flow.setName}")`,
      flow.blocks.length ? `\nKhối cố định (viết placeholder, CLI tự thay nguyên văn):\n${blockList}` : '\nKhông có khối cố định: tự viết đủ prompt theo luật dưới.',
      flow.forbidden.length ? `\nTừ cấm trong phần cảnh: ${flow.forbidden.join(', ')}` : '',
      characterList ? `\nNhân vật tham chiếu (mỗi cảnh ảnh phải có "references"):\n${characterList}` : '',
      '\nPhần thời lượng cảnh và định dạng JSON đầu ra trong prompt dưới KHÔNG áp dụng: theo luật nhịp của skill và định dạng plan.json.',
      '\n---\n',
      flow.rules,
    ].join('\n'),
    'utf8',
  );

  const current = readJson(path.join(ref.dir, AI_SCENE_PROMPTS_FILENAME))?.scenes ?? [];
  const totalSec = (srtTimestampToMs(cues.at(-1)!.endTime) / 1000) / speed;
  const stats = paceStats(onScreen(current, speed));
  const state = readJson(path.join(ref.dir, STATE_FILE));
  console.log(`Video ${ref.videoId} · ${ref.channel.name} · ${ref.status} · "${ref.title}"`);
  console.log(`Thời lượng ${clock(totalSec)} · ${cues.length} câu (${cues.filter(endsSentence).length} câu kết thúc bằng ●) · tốc độ đọc x${speed.toFixed(3)} · transcript ${path.basename(subtitle!)} · ${chapters.size} chương nhận ra từ script.txt`);
  console.log(`Luồng hình: ${flow.mode} (${flow.key}) · ${flow.blocks.length} khối cố định · ${flow.forbidden.length} từ cấm${flow.characters.length ? ` · ${flow.characters.length} nhân vật` : ''}`);
  console.log(`Cảnh hiện tại: ${stats.scenes} · trung vị ${stats.median}s · p90 ${stats.p90}s · thân bài ${stats.bodyMedian}s · ${stats.over12}% >12s · dài nhất ${stats.longest}s`);
  const span = (from: number, to: number) => Math.max(0, Math.min(totalSec, to) - from);
  const estimate = Math.round(span(0, 30) / 4 + span(30, 180) / 5.5 + span(180, 600) / 8 + span(600, Infinity) / 10);
  console.log(`Ước lượng theo luật nhịp: khoảng ${estimate} cảnh (±20%)`);
  if (state) console.log(`Skill đã chạy: ${state.status} lúc ${state.appliedAt}${state.drawnAt ? `, vẽ lúc ${state.drawnAt}` : ''}`);
  if (!PRODUCTION.has(ref.status)) console.log(`CHÚ Ý: trạng thái ${ref.status}, server chỉ vẽ ảnh cho video Prepared/Created.`);
  console.log(`Đã ghi: ${path.join(out, 'cues.txt')}`);
  console.log(`        ${path.join(out, 'rules.md')}`);
  console.log(`Viết kế hoạch vào: ${path.join(out, 'plan.json')}`);
}

async function check(partial = false): Promise<{ ref: VideoRef; result: CheckResult }> {
  const ref = resolveVideo(target);
  const subtitle = subtitlePath(ref.dir);
  if (!subtitle) fail('Video chưa có transcript.');
  const cues = await loadTranscriptCuesFromSrt(subtitle!);
  const flow = await resolveFlow(ref);
  const result = checkPlan(loadPlan(ref, extra), cues, flow, audioSpeed(ref), partial);
  if (partial) console.log(`(kiểm một phần: tới câu ${loadPlan(ref, extra).at(-1)?.to}/${cues.length}, cảnh cuối chưa tính độ dài)`);
  else writeJson(path.join(workDir(ref), 'check.json'), { checkedAt: new Date().toISOString(), passed: result.passed, errors: result.errors, warnings: result.warnings, stats: result.stats, hash: planHash(result.scenes) });
  const s = result.stats;
  console.log(`${result.passed ? 'ĐẠT' : 'CHƯA ĐẠT'} · ${s.scenes} cảnh · trung vị ${s.median}s · p90 ${s.p90}s · thân bài ${s.bodyMedian}s · ${s.over12}% >12s · dài nhất ${s.longest}s`);
  for (const error of result.errors.slice(0, 60)) console.log(`  LỖI  ${error}`);
  if (result.errors.length > 60) console.log(`  … thêm ${result.errors.length - 60} lỗi`);
  for (const warning of result.warnings.slice(0, 40)) console.log(`  NHẮC ${warning}`);
  if (result.warnings.length > 40) console.log(`  … thêm ${result.warnings.length - 40} nhắc`);
  return { ref, result };
}

async function apply() {
  const { ref, result } = await check();
  if (!result.passed) fail('Chưa ĐẠT: sửa kế hoạch rồi chạy lại.');
  const backup = path.join(ref.dir, BACKUP_DIR, stamp());
  let moved = 0;
  for (const name of SCENE_ARTIFACTS) {
    const from = path.join(ref.dir, name);
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(backup, { recursive: true });
    fs.renameSync(from, path.join(backup, name));
    moved += 1;
  }
  const previous = readJson(path.join(backup, AI_SCENE_PROMPTS_FILENAME))?.scenes ?? [];
  writeJson(path.join(ref.dir, AI_SCENE_PROMPTS_FILENAME), buildAiScenePromptsFile(ref.videoId, result.scenes));
  writeJson(path.join(ref.dir, 'scene-split-plan.json'), { scenes: loadPlan(ref, extra) });
  writeJson(path.join(ref.dir, STATE_FILE), {
    status: 'applied',
    appliedAt: new Date().toISOString(),
    hash: planHash(result.scenes),
    scenes: result.scenes.length,
    stats: result.stats,
    previous: { scenes: previous.length, stats: paceStats(onScreen(previous, audioSpeed(ref))) },
    backup: moved ? path.relative(ref.dir, backup) : null,
  });
  console.log(`Đã thay ${previous.length} cảnh cũ bằng ${result.scenes.length} cảnh mới.${moved ? ` Bản cũ (prompt, ảnh, clip) ở ${backup}` : ''}`);
  console.log('Ảnh chưa vẽ: chạy `npm run -s scene -- draw <video>` (server phải đang chạy).');
}

async function draw() {
  const ref = resolveVideo(target);
  const state = readJson(path.join(ref.dir, STATE_FILE));
  if (!state) fail('Video chưa áp kế hoạch của skill (chưa có scene-split.json). Chạy apply trước.');
  if (!PRODUCTION.has(ref.status)) fail(`Trạng thái ${ref.status}: server chỉ vẽ cho video Prepared/Created.`);
  if (!(await serverUp())) fail(`Server app không chạy ở cổng ${env.port}. Bật app rồi chạy lại.`);
  const busy = await serverBusy();
  if (busy > 0) console.log(`CHÚ Ý: hàng đợi app đang có ${busy} việc; vẽ ảnh sẽ tranh profile Flow với các việc đó.`);
  const before = readJson(path.join(ref.dir, AI_SCENE_PROMPTS_FILENAME))?.scenes ?? [];
  const missingBefore = before.filter((scene: any) => scene.type !== 'title' && !scene.path).length;
  console.log(`Gửi server vẽ ${missingBefore} ảnh còn thiếu (có thể mất lâu, đừng tắt app)…`);
  const started = Date.now();
  const response = await post(`/video-production/videos/${ref.channel.id}/${ref.videoId}/scenes/regenerate-missing`);
  const after = readJson(path.join(ref.dir, AI_SCENE_PROMPTS_FILENAME))?.scenes ?? [];
  const missing = after
    .map((scene: any, index: number) => ({ scene, index }))
    .filter(({ scene }: any) => scene.type !== 'title' && !(scene.path && fs.existsSync(path.resolve(ref.dir, scene.path))))
    .map(({ index }: any) => index + 1);
  const minutes = r1((Date.now() - started) / 60000);
  writeJson(path.join(ref.dir, STATE_FILE), { ...state, status: missing.length ? 'partial' : 'drawn', drawnAt: new Date().toISOString(), missing });
  if (response.status >= 400) console.log(`Server báo lỗi ${response.status}: ${typeof response.body === 'string' ? response.body.slice(0, 300) : JSON.stringify(response.body).slice(0, 300)}`);
  console.log(`Xong sau ${minutes} phút: ${after.length - missing.length}/${after.length} cảnh có ảnh.${missing.length ? ` Còn thiếu: ${missing.slice(0, 40).join(', ')}${missing.length > 40 ? '…' : ''} (chạy lại draw)` : ''}`);
}

async function restore() {
  const ref = resolveVideo(target);
  const root = path.join(ref.dir, BACKUP_DIR);
  const backups = fs.existsSync(root) ? fs.readdirSync(root).filter(name => !name.endsWith('-replaced')).sort() : [];
  const latest = backups.at(-1);
  if (!latest) fail('Không có bản sao lưu nào.');
  const aside = path.join(root, `${stamp()}-replaced`);
  for (const name of SCENE_ARTIFACTS) {
    const current = path.join(ref.dir, name);
    if (!fs.existsSync(current)) continue;
    fs.mkdirSync(aside, { recursive: true });
    fs.renameSync(current, path.join(aside, name));
  }
  for (const name of fs.readdirSync(path.join(root, latest!))) fs.renameSync(path.join(root, latest!, name), path.join(ref.dir, name));
  fs.rmSync(path.join(root, latest!), { recursive: true, force: true });
  const state = readJson(path.join(ref.dir, STATE_FILE)) ?? {};
  writeJson(path.join(ref.dir, STATE_FILE), { ...state, status: 'restored', restoredAt: new Date().toISOString() });
  console.log(`Đã trả lại bộ cảnh ${latest}. Bộ cảnh của skill để ở ${aside}.`);
}

const commands: Record<string, () => Promise<unknown>> = { scan, info, check: () => check(has('part')), apply, draw, restore };
const run = commands[command ?? ''];
if (!run) {
  console.log('Dùng: npm run -s scene -- scan [kênh|video] [--json] | info <video> | check <video> [plan.json] [--part] | apply <video> [plan.json] | draw <video> | restore <video>');
  process.exit(command ? 1 : 0);
}
run!()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
