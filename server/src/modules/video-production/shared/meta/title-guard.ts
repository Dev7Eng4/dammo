/**
 * Code-side checks on a generated title, for meta prompts that show sample titles of other channels
 * (cluster prompts `data/prompts/ja/metadata_tlnb_k*`: lines `Mẫu title (...): A / B`).
 * The prompt already forbids copying them, but models still drift to a sample when the video has the same topic.
 */

/** A title whose bigrams cover at least this share of a sample title is a near copy. */
export const SAMPLE_CONTAINMENT_LIMIT = 0.6;
/** Containment is only judged against samples at least this long (short ones are generic topic phrases). */
export const SAMPLE_MIN_LENGTH = 12;
/** Any shared run of this many characters with a sample is a copy. */
export const SAMPLE_MAX_SHARED_RUN = 12;
/** Strong promises the title may only make when the transcript itself uses the word. */
export const PROMISE_WORDS = ['復活', '劇的', '一瞬で', '激変', '必ず', '奇跡', '完治'] as const;

const SAMPLE_LINE = /Mẫu title[^:\n]*:\s*(.+)$/gm;
const NOISE = /[\s、。,.!！?？「」『』【】（）()［］[\]｜|…・“”"'※:：〜~\-ー]/g;

export function normalizeTitle(text: string): string {
  return text.replace(NOISE, '');
}

/** Sample titles listed in a meta prompt (`Mẫu title (...): A / B`). */
export function extractSampleTitles(prompt: string): string[] {
  const samples: string[] = [];
  for (const match of prompt.matchAll(SAMPLE_LINE)) {
    for (const part of match[1].split(' / ')) {
      const sample = part.trim();
      if (sample) samples.push(sample);
    }
  }
  return samples;
}

function bigrams(text: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < text.length - 1; i += 1) out.add(text.slice(i, i + 2));
  return out;
}

function longestSharedRun(a: string, b: string): number {
  let best = 0;
  const prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const above = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diagonal + 1 : 0;
      if (prev[j] > best) best = prev[j];
      diagonal = above;
    }
  }
  return best;
}

/**
 * Shared bigrams that the transcript never uses must reach this count before overlap counts as copying:
 * overlap made only of the video's own topic words (e.g. 一人で旅行できる人) is not a copy.
 */
export const SAMPLE_MIN_FOREIGN_BIGRAMS = 3;

export interface SampleCopy {
  sample: string;
  containment: number;
  sharedRun: number;
  /** Shared bigrams absent from the transcript: words that came from the sample, not from the video. */
  foreign: string[];
}

/**
 * The sample the title copies, if any. Only the part of a sample before ｜ is compared for containment.
 * With a transcript, overlap only counts when it carries words the transcript never uses.
 */
export function findCopiedSample(title: string, samples: string[], transcript?: string): SampleCopy | undefined {
  const normalizedTitle = normalizeTitle(title);
  const normalizedTranscript = transcript === undefined ? undefined : normalizeTitle(transcript);
  const titleBigrams = bigrams(normalizedTitle);
  for (const sample of samples) {
    const head = normalizeTitle(sample.split(/[｜|]/)[0]);
    const headBigrams = bigrams(head);
    let shared = 0;
    const foreign: string[] = [];
    for (const gram of headBigrams) {
      if (!titleBigrams.has(gram)) continue;
      shared += 1;
      if (normalizedTranscript !== undefined && !normalizedTranscript.includes(gram)) foreign.push(gram);
    }
    const containment = headBigrams.size ? shared / headBigrams.size : 0;
    const sharedRun = longestSharedRun(normalizedTitle, normalizeTitle(sample));
    const fromSample = normalizedTranscript === undefined || foreign.length >= SAMPLE_MIN_FOREIGN_BIGRAMS;
    const nearCopy = head.length >= SAMPLE_MIN_LENGTH && containment >= SAMPLE_CONTAINMENT_LIMIT;
    if (fromSample && (nearCopy || sharedRun >= SAMPLE_MAX_SHARED_RUN)) return { sample, containment, sharedRun, foreign };
  }
  return undefined;
}

const COMPOSITION_LINE = /Composition thumbnail:\s*(.+)$/gm;
/** Thumbnail devices the formats mean to be reused as they are (not a hook copied from another channel). */
const SHARED_DEVICES = ['ほとんどが', '第1位は意外', 'あなたはどの階層ですか', '決まってこうなる', 'ここで差がつく'];
/** Example texts this short are devices (※ lines, endings), free to reuse. */
const DEVICE_MAX_LENGTH = 6;

/** Japanese text examples (「...」) shown in the Composition lines of a meta prompt. */
export function extractCompositionExamples(prompt: string): string[] {
  const examples = new Set<string>();
  for (const line of prompt.matchAll(COMPOSITION_LINE)) {
    for (const quoted of line[1].matchAll(/「([^」]+)」/g)) examples.add(quoted[1]);
  }
  return [...examples];
}

/**
 * Thumbnail hook lines that reuse Composition examples of another channel:
 * - one long example word for word, unless every part of it is in the transcript (the video says it too);
 * - or two lines or more that each equal an example (a whole competitor thumbnail rebuilt from short pieces).
 */
export function findCopiedHookLines(hookLines: string[], examples: string[], transcript?: string): string[] {
  const normalizedTranscript = transcript === undefined ? undefined : normalizeTitle(transcript);
  const candidates = examples.map(normalizeTitle).filter(example => example.length > 1 && !SHARED_DEVICES.includes(example));
  const fromOtherChannel = (example: string) =>
    normalizedTranscript === undefined || [...bigrams(example)].some(gram => !normalizedTranscript.includes(gram));
  const longHooks = candidates.filter(example => example.length > DEVICE_MAX_LENGTH && fromOtherChannel(example));

  const lines = hookLines.map(line => ({ line, normalized: normalizeTitle(line) })).filter(item => item.normalized);
  const single = lines.filter(({ normalized }) => longHooks.some(ex => normalized === ex || normalized.includes(ex)));
  const exact = lines.filter(({ normalized }) => candidates.includes(normalized));
  const copied = new Set(single.map(item => item.line));
  if (exact.length >= 2) for (const item of exact) copied.add(item.line);
  return hookLines.filter(line => copied.has(line));
}

const toHalfWidth = (text: string) => text.replace(/[０-９]/g, digit => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
const STAT_PATTERN = /(?:[0-9]+|[一二三四五六七八九十])割|[0-9]+(?:\.[0-9]+)?[%％]/g;

/**
 * Share claims (9割, 7割, 80%...) in the title that the transcript never states.
 * Labels in 【】 (e.g. 【※99%が知らない】) are a genre convention and are not checked.
 */
export function findUnsupportedStats(title: string, transcript: string): string[] {
  const body = toHalfWidth(title.replace(/【[^】]*】/g, ''));
  const source = toHalfWidth(transcript);
  const claims = new Set(body.match(STAT_PATTERN) ?? []);
  return [...claims].filter(claim => !source.includes(claim.replace('％', '%')) && !source.includes(claim.replace('%', '％')));
}

/** Promise words in the title that the transcript never uses. */
export function findUnsupportedPromises(title: string, transcript: string): string[] {
  return PROMISE_WORDS.filter(word => title.includes(word) && !transcript.includes(word));
}

export interface TitleGuardResult {
  ok: boolean;
  /** Human-readable reasons (Vietnamese, fed back to the model on the next attempt). */
  reasons: string[];
}

/**
 * Checks the title against the sample titles in the prompt and against the transcript.
 * Prompts without sample titles are not checked (other niches keep their behaviour).
 */
export function checkTitleGuards(input: {
  title: string;
  prompt: string;
  transcript: string;
  /** Thumbnail text lines the meta prompt planned (thumbnail.hook_lines), when it has them. */
  hookLines?: string[];
}): TitleGuardResult {
  const samples = extractSampleTitles(input.prompt);
  if (samples.length === 0 || !input.title.trim()) return { ok: true, reasons: [] };

  const reasons: string[] = [];
  const copied = findCopiedSample(input.title, samples, input.transcript);
  if (copied) {
    reasons.push(
      `title 「${input.title}」 gần như chép mẫu 「${copied.sample}」 (trùng ${Math.round(copied.containment * 100)}%, đoạn liền dài nhất ${copied.sharedRun} ký tự): viết title mới bằng từ ngữ và chi tiết của transcript, đổi cả cấu trúc câu`,
    );
  }
  const promises = findUnsupportedPromises(input.title, input.transcript);
  if (promises.length > 0) {
    reasons.push(
      `title dùng ${promises.map(word => `「${word}」`).join('、')} nhưng transcript không hề nói vậy: bỏ từ đó, dùng lời hứa đúng mức transcript`,
    );
  }
  const stats = findUnsupportedStats(input.title, input.transcript);
  if (stats.length > 0) {
    reasons.push(
      `title nêu tỉ lệ ${stats.map(stat => `「${stat}」`).join('、')} nhưng transcript không có con số đó: bỏ con số, không bịa thống kê (nhãn 【】 đầu title không tính)`,
    );
  }
  const copiedHooks = findCopiedHookLines(input.hookLines ?? [], extractCompositionExamples(input.prompt), input.transcript);
  if (copiedHooks.length > 0) {
    reasons.push(
      `thumbnail.hook_lines ${copiedHooks.map(line => `「${line}」`).join('、')} chép nguyên ví dụ trong Composition (câu của kênh khác): viết chữ thumbnail mới từ transcript, chỉ giữ thiết bị chung như 「ほとんどが…」「※第1位は意外」`,
    );
  }
  return { ok: reasons.length === 0, reasons };
}

/** Appended to the next attempt's prompt after a guard rejection. */
export function formatTitleGuardFeedback(reasons: string[]): string {
  return `\n\n====================================================\nLẦN TRẢ LỜI TRƯỚC BỊ LOẠI (sửa rồi trả lại toàn bộ JSON)\n====================================================\n${reasons
    .map(reason => `- ${reason}`)
    .join('\n')}\n`;
}
