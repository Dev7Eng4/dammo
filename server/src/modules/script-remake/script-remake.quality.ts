/**
 * Mechanical checks on one remade chapter, run in code right after the LLM writes it. They catch the
 * faults that make a remake read as generic or broken when narrated: template transitions, the same
 * mood words over and over, a sentence or example phrase written twice, placeholders the TTS reads
 * aloud, Latin letters, and a chapter far off its length. A failing chapter is sent back once.
 */

/** Phrases that mark the "recap, then announce the next chapter" mould. */
const TEMPLATE_PHRASES = ['それではここから', '次の章では', '先ほどお話ししたように', 'ここまでお話ししてきた'];

/** Mood words that turn a script vague when repeated; limit per chapter. */
const MOOD_WORDS: { label: string; pattern: RegExp; max: number }[] = [
  { label: '温かい', pattern: /温か|あたたか/g, max: 1 },
  { label: '心地よい', pattern: /心地よ|心地良/g, max: 1 },
  { label: '安心感', pattern: /安心感/g, max: 1 },
  { label: 'キャッチボール', pattern: /キャッチボール/g, max: 1 },
  { label: 'ほんの', pattern: /ほんの/g, max: 2 },
];

const SOFT_ENDINGS = /(ですよ|のですね)[。！!]/g;
const MAX_SOFT_ENDINGS = 2;
const PLACEHOLDER = /[〇○◯]{2}|××|ＸＸ|△△/;
const LATIN = /[A-Za-zＡ-Ｚａ-ｚ]/;
/** A chapter may open with "…ありませんか" this many times in the whole video. */
const MAX_QUESTION_OPENINGS = 2;
const QUESTION_OPENING = /(ことは|経験は)?ありませんか[。？?]?$/;
/**
 * Characters in a row (punctuation removed) that count as a repeated passage: against earlier
 * chapters, and tighter inside one chapter, where an example phrase written twice is the usual fault.
 */
const REPEAT_WINDOW = 18;
const REPEAT_WINDOW_SAME_CHAPTER = 12;
/**
 * Characters in a row (punctuation removed) shared with the reference transcript that count as copied
 * wording. Same size as the 15-gram similarity gate, so a chapter that passes here keeps that gate low.
 */
const SOURCE_COPY_WINDOW = 15;
/** At most this many copied sentences are quoted back to the LLM. */
const SOURCE_COPY_QUOTES = 5;
const LENGTH_MIN_RATIO = 0.75;
const LENGTH_MAX_RATIO = 1.35;

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function compact(text: string): string {
  return text.replace(/[\s、。，．,.！？!?「」『』（）()・…ー〜~]/g, '');
}

function windows(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + size <= text.length; i++) out.push(text.slice(i, i + size));
  return out;
}

/** Sentences that repeat a passage from an earlier chapter, or from earlier in this chapter. */
function repeatedPassages(sentences: string[], previous: string[][]): string[] {
  const earlier = new Set(previous.flat().flatMap(sentence => windows(compact(sentence), REPEAT_WINDOW)));
  const thisChapter = new Set<string>();
  const found: string[] = [];
  for (const sentence of sentences) {
    const text = compact(sentence);
    const own = windows(text, REPEAT_WINDOW_SAME_CHAPTER);
    if (windows(text, REPEAT_WINDOW).some(w => earlier.has(w)) || own.some(w => thisChapter.has(w))) {
      found.push(sentence);
    }
    for (const w of own) thisChapter.add(w);
  }
  return found;
}

/** Sentences that share a run of `SOURCE_COPY_WINDOW` characters with the reference transcript. */
export function sourceCopiedSentences(sentences: string[], source: string): string[] {
  const sourceWindows = new Set(windows(compact(source), SOURCE_COPY_WINDOW));
  if (sourceWindows.size === 0) return [];
  return sentences.filter(sentence => windows(compact(sentence), SOURCE_COPY_WINDOW).some(w => sourceWindows.has(w)));
}

export interface ChapterCheckInput {
  sentences: string[];
  /** Sentences of the chapters already accepted, in order. */
  previous: string[][];
  targetChars: number;
  /** Reference video transcript; sentences copying its wording are sent back. */
  source?: string;
}

/** Problems in Japanese, ready to send back to the LLM. Empty when the chapter passes. */
export function chapterProblems({ sentences, previous, targetChars, source }: ChapterCheckInput): string[] {
  const text = sentences.join('');
  const problems: string[] = [];

  const copied = source ? sourceCopiedSentences(sentences, source) : [];
  if (copied.length) {
    problems.push(
      `参考動画とほぼ同じ言い回しの文が${copied.length}文ある。研究や話題は同じでよいが、説明の文・具体例・セリフは自分の言葉と別の場面で書き直す: ` +
        copied.slice(0, SOURCE_COPY_QUOTES).map(s => `「${s}」`).join(''),
    );
  }

  const templates = TEMPLATE_PHRASES.filter(phrase => text.includes(phrase));
  if (templates.length) problems.push(`決まった型の言い回しを使っている: ${templates.map(p => `「${p}」`).join('')}`);

  for (const { label, pattern, max } of MOOD_WORDS) {
    const n = count(text, pattern);
    if (n > max) problems.push(`「${label}」が${n}回ある（${max}回まで）`);
  }
  const soft = count(text, SOFT_ENDINGS);
  if (soft > MAX_SOFT_ENDINGS) problems.push(`文末の「ですよ」「のですね」が${soft}回ある（${MAX_SOFT_ENDINGS}回まで）`);

  if (PLACEHOLDER.test(text)) problems.push('〇〇・××のような伏せ字がある。具体的な名前にする');
  if (LATIN.test(text)) problems.push('英字がある。カタカナか日本語にする');

  const repeats = repeatedPassages(sentences, previous);
  if (repeats.length) {
    problems.push(`前に書いた文や例とほぼ同じ文がある: ${repeats.slice(0, 3).map(s => `「${s}」`).join('')}`);
  }

  const opensWithQuestion = (chapter: string[]) => QUESTION_OPENING.test(chapter[0] ?? '');
  if (opensWithQuestion(sentences) && previous.filter(opensWithQuestion).length >= MAX_QUESTION_OPENINGS) {
    problems.push(`「〜ありませんか」で始まる章がすでに${MAX_QUESTION_OPENINGS}つある。別の入り方にする`);
  }

  if (text.length < targetChars * LENGTH_MIN_RATIO) {
    problems.push(`${text.length}字しかない（目安${targetChars}字）。繰り返しではなく、場面や具体例を足す`);
  } else if (text.length > targetChars * LENGTH_MAX_RATIO) {
    problems.push(`${text.length}字ある（目安${targetChars}字）。重複や一般論を削る`);
  }
  return problems;
}

export function chapterFixPrompt(chapterNumber: number, problems: string[]): string {
  return [
    `第${chapterNumber}章に次の問題があります:`,
    ...problems.map(problem => `- ${problem}`),
    '',
    '内容と流れは保ったまま、問題を直して第' + chapterNumber + '章の全文を書き直してください。',
    '出力はテキストのコードブロック1つだけ。1行に1文。説明文は不要。',
  ].join('\n');
}
