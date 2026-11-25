/**
 * Caption segmentation for burned-in subtitles.
 *
 * Source transcripts (YouTube auto captions, ASR) cut cues every ~20 characters regardless of
 * meaning, so a cue often ends mid-word (`…皆` / `さんの…`). For Japanese we re-cut the track:
 * the text is re-joined, split into sentences, then each sentence into display lines at 、 or at
 * the most natural point near the middle. Timing is carried over per character from the source
 * cues, so the new cues stay in sync with the voice.
 */

export interface CaptionCue {
  startMs: number;
  endMs: number;
  text: string;
}

/** A pause longer than this between two source cues is never bridged by one caption. */
const HARD_BREAK_GAP_MS = 600;
/** Captions shorter than this get merged into a neighbour when the result still fits. */
const MIN_CUE_MS = 1000;

const SENTENCE_END = new Set(['。', '！', '？', '!', '?', '…']);
const CLOSING = new Set(['」', '』', '）', ')', '】', '〉', '》', '”', '’']);
const CLAUSE_END = new Set(['、', '，', ',', '；', ';', '：', ':']);
/** Characters a line must not start with (kinsoku). */
const NO_LINE_START = new Set([
  ...'、。，．,.!?！？…・ー〜～）)」』】〉》”’',
  ...'ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ',
]);
/** Characters a line must not end with. */
const NO_LINE_END = new Set([...'（(「『【〈《“‘']);
/** Particles and the te-form ending: a line may end after them when a new word (kanji/katakana) follows. */
const PARTICLES = new Set([...'はがをにでともへのて']);

const HIRAGANA = /\p{Script=Hiragana}/u;
const FULL_WIDTH = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]/u;

/** Display width in font-size units: full-width glyphs are 1, Latin letters, digits and spaces about half. */
export function captionTextWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += FULL_WIDTH.test(ch) ? 1 : 0.55;
  return width;
}

function isHiragana(ch: string | undefined): boolean {
  return ch !== undefined && HIRAGANA.test(ch) && ch !== 'ー';
}

/** Higher is a better place to break between chars[i - 1] and chars[i]; -Infinity is forbidden. */
function breakScore(chars: string[], i: number, target: number): number {
  const prev = chars[i - 1];
  const next = chars[i];
  if (i <= 0 || i >= chars.length) return Number.NEGATIVE_INFINITY;
  if (NO_LINE_START.has(next) || NO_LINE_END.has(prev)) return Number.NEGATIVE_INFINITY;

  let score = -Math.abs(i - target);
  if (CLAUSE_END.has(prev) || SENTENCE_END.has(prev) || CLOSING.has(prev)) score += 6;
  else if (prev === ' ' || next === ' ') score += 5;
  else if (PARTICLES.has(prev) && !isHiragana(next)) score += 4;
  else if (isHiragana(prev) && !isHiragana(next)) score += 2;
  // Breaking inside a run of hiragana usually splits a word or an inflection (広がっ|ています).
  else if (isHiragana(prev) && isHiragana(next)) score -= 5;
  return score;
}

/** Best break index near `target`, searched within `window` characters and never past `maxIndex`. */
function findBreak(chars: string[], target: number, window: number, maxIndex: number): number {
  let best = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  const lo = Math.max(1, target - window);
  const hi = Math.min(chars.length - 1, target + window, maxIndex);
  for (let i = lo; i <= hi; i++) {
    const score = breakScore(chars, i, target);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best === -1 ? Math.min(Math.max(1, target), chars.length - 1, maxIndex) : best;
}

/** Cuts one clause that is too long into pieces of balanced length. */
function splitBalanced(text: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let chars = Array.from(text);
  while (chars.length > maxChars) {
    const count = Math.ceil(chars.length / maxChars);
    const target = Math.round(chars.length / count);
    const window = Math.max(2, Math.min(5, Math.floor(target / 2)));
    const at = findBreak(chars, target, window, maxChars);
    pieces.push(chars.slice(0, at).join(''));
    chars = chars.slice(at);
  }
  if (chars.length) pieces.push(chars.join(''));
  return pieces.map(p => p.trim()).filter(Boolean);
}

/**
 * Splits one sentence into lines of at most `maxChars`: first at clause marks (、), packing
 * clauses greedily, then any clause still too long is cut in balanced halves at a natural point.
 */
export function splitCaptionSentence(sentence: string, maxChars: number): string[] {
  const text = sentence.trim();
  const limit = Math.max(4, Math.floor(maxChars));
  if (Array.from(text).length <= limit) return text ? [text] : [];

  const clauses: string[] = [];
  let current = '';
  for (const ch of text) {
    current += ch;
    if (CLAUSE_END.has(ch)) {
      clauses.push(current);
      current = '';
    }
  }
  if (current) clauses.push(current);

  const lines: string[] = [];
  let line = '';
  for (const clause of clauses) {
    // A short lead-in (`ああ、`, `最後に、`) is joined to the next clause and the pair cut in balance,
    // so it is not left on screen alone for half a second.
    const shortLead = Array.from(line).length <= Math.floor(limit / 3);
    if (line && Array.from(line + clause).length > limit && !shortLead) {
      lines.push(line);
      line = '';
    }
    line += clause;
    if (Array.from(line).length > limit) {
      const pieces = splitBalanced(line, limit);
      lines.push(...pieces.slice(0, -1));
      line = pieces.at(-1) ?? '';
    }
  }
  if (line) lines.push(line);

  return mergeOrphanLines(lines.map(l => l.trim()).filter(Boolean), limit);
}

/** A 1–3 character tail (`たち。`) reads badly on its own: fold it into the previous line, re-balancing if needed. */
function mergeOrphanLines(lines: string[], limit: number): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const prev = out.at(-1);
    if (prev !== undefined && Array.from(line).length <= 3) {
      const joined = prev + line;
      out.pop();
      out.push(...(Array.from(joined).length <= limit ? [joined] : splitBalanced(joined, limit)));
      continue;
    }
    out.push(line);
  }
  return out;
}

interface TimedChar {
  ch: string;
  startMs: number;
  endMs: number;
  /** A long pause follows this character. */
  hardBreak: boolean;
}

function toTimedChars(cues: CaptionCue[]): TimedChar[] {
  const out: TimedChar[] = [];
  for (const [index, cue] of cues.entries()) {
    const chars = Array.from(cue.text.replace(/\s*\n\s*/g, ''));
    if (!chars.length) continue;
    const span = Math.max(0, cue.endMs - cue.startMs);
    const weights = chars.map(ch => (CLAUSE_END.has(ch) || SENTENCE_END.has(ch) ? 0.5 : 1));
    const total = weights.reduce((sum, w) => sum + w, 0);
    let t = cue.startMs;
    for (const [i, ch] of chars.entries()) {
      const d = (span * weights[i]) / total;
      out.push({ ch, startMs: t, endMs: t + d, hardBreak: false });
      t += d;
    }
    const next = cues[index + 1];
    if (!next || next.startMs - cue.endMs > HARD_BREAK_GAP_MS) out[out.length - 1].hardBreak = true;
  }
  return out;
}

/** Groups characters into sentences, ending at 。！？ (plus closing brackets) or at a long pause. */
function toSentences(chars: TimedChar[]): TimedChar[][] {
  const sentences: TimedChar[][] = [];
  let current: TimedChar[] = [];
  for (let i = 0; i < chars.length; i++) {
    current.push(chars[i]);
    const isEnd = SENTENCE_END.has(chars[i].ch) && !SENTENCE_END.has(chars[i + 1]?.ch ?? '');
    if (isEnd) {
      while (i + 1 < chars.length && CLOSING.has(chars[i + 1].ch)) current.push(chars[++i]);
    }
    if (isEnd || chars[i].hardBreak) {
      sentences.push(current);
      current = [];
    }
  }
  if (current.length) sentences.push(current);
  return sentences;
}

type SentenceCue = CaptionCue & { sentence: number };

/** Merges a too-short caption into its neighbour within the same sentence, when the result still fits. */
function mergeShortCues(cues: SentenceCue[], maxChars: number): CaptionCue[] {
  const out: SentenceCue[] = [];
  for (const cue of cues) {
    const prev = out.at(-1);
    const contiguous = prev !== undefined && prev.sentence === cue.sentence && cue.startMs - prev.endMs < 50;
    const fits = prev !== undefined && Array.from(prev.text + cue.text).length <= maxChars;
    const tooShort = prev !== undefined && (prev.endMs - prev.startMs < MIN_CUE_MS || cue.endMs - cue.startMs < MIN_CUE_MS);
    if (prev && contiguous && fits && tooShort) {
      out[out.length - 1] = { ...prev, endMs: cue.endMs, text: prev.text + cue.text };
      continue;
    }
    out.push({ ...cue });
  }
  return out.map(({ startMs, endMs, text }) => ({ startMs, endMs, text }));
}

/**
 * Re-cuts a Japanese caption track along sentence and clause boundaries so no caption ends
 * mid-word. Each returned cue is at most `maxChars` characters (one display line).
 */
export function resegmentJapaneseCues(cues: CaptionCue[], maxChars: number): CaptionCue[] {
  const sorted = [...cues].filter(c => c.text.trim()).sort((a, b) => a.startMs - b.startMs);
  const chars = toTimedChars(sorted);
  const result: SentenceCue[] = [];

  for (const [sentenceIndex, sentence] of toSentences(chars).entries()) {
    const text = sentence.map(c => c.ch).join('');
    let offset = 0;
    for (const line of splitCaptionSentence(text, maxChars)) {
      // Lines are trimmed, so find each one in the sentence to map it back onto its characters.
      const startIndex = Array.from(text).indexOf(Array.from(line)[0], offset);
      const from = startIndex === -1 ? offset : startIndex;
      const to = Math.min(sentence.length, from + Array.from(line).length);
      if (from >= to) continue;
      result.push({ startMs: sentence[from].startMs, endMs: sentence[to - 1].endMs, text: line, sentence: sentenceIndex });
      offset = to;
    }
  }

  return mergeShortCues(result, maxChars);
}

/**
 * Wraps one caption into display lines no wider than `maxWidth` (font-size units), balancing
 * line lengths and never leaving one or two stray characters on the last line. Text with
 * spaces (Latin, Korean) wraps between words only.
 */
export function wrapCaptionText(text: string, maxWidth: number): string[] {
  const clean = text.trim();
  const width = captionTextWidth(clean);
  if (width <= maxWidth || !clean) return clean ? [clean] : [];

  const lineCount = Math.ceil(width / maxWidth);
  const targetWidth = width / lineCount;

  if (/\s/.test(clean)) {
    const words = clean.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      const remaining = lineCount - lines.length;
      if (line && remaining > 1 && captionTextWidth(candidate) > Math.min(maxWidth, targetWidth * 1.15)) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  const chars = Array.from(clean);
  const perLine = Math.ceil(chars.length / lineCount);
  return splitBalanced(clean, Math.max(perLine, Math.floor(maxWidth * (chars.length / width))));
}
