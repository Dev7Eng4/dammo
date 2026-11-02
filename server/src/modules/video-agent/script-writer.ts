import type Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';
import { addUsage, assertNotRefused, FALLBACK_BETA, getClaudeClient } from './claude.js';
import type {
  ChapterForm,
  OpeningType,
  VideoAgentOutline as ScriptOutline,
  VideoAgentScriptChapter,
  VideoAgentUsage,
} from './video-agent.types.js';

/** Narration pace used for length planning (measured ~330–350 chars/min on the reference channel). */
export const NARRATION_CHARS_PER_MIN = 330;

export interface ScriptSource {
  title: string;
  text: string;
}

const ChapterOutput = z.object({
  sentences: z
    .array(z.string())
    .describe('Narration sentences in order. One spoken sentence per item, ending with 。, ？ or ！'),
});

const STYLE_RULES = `You are the narration scriptwriter for a Japanese YouTube channel about psychology and brain science. The audience is mainly Japanese viewers aged 50-70. Write the narration itself in natural spoken Japanese; everything below is an instruction to you.

Style:
- です・ます register. Warm, calm voice. Address the viewer as あなた.
- Sentences of about 40 characters or fewer; split long ones. The script is read by speech synthesis, so no symbols, English abbreviations, emoji or parenthetical asides (write foreign words in katakana).
- Write numbers in forms that are hard to misread (e.g. 3つ, 10年, 60代).
- Never stay abstract: give examples from concrete everyday scenes (the supermarket, a bankbook, a conversation with family).
- Do not invent studies, universities or statistics. When unsure, state it as a general observation ("心理学では〜と言われています"). No medical claims.

Flow (the whole video must read as one story):
- Each chapter starts from a question or realisation raised by the previous chapter, adds one new discovery, and ends leaving a deeper question for the next.
- Open each chapter with a sentence that picks up what the previous chapter ended on. Do not open with only a mechanical connector such as 「さて」「では」「次に」「2つ目は」.
- Except for the last chapter, end by bridging to the next chapter's theme (a question, a hint, a lingering thought) without telling the next chapter's content.
- Do not reuse a concrete example, anecdote, metaphor or catchphrase already used in an earlier chapter. Do not pad by rewording the same claim.
- Go deeper as the video goes on: familiar empathy first, reasons and mechanisms in the middle, what to do today and reassurance at the end.
- Even inside a chapter, use small questions and 「実は」 to keep the viewer's interest.

Specificity and originality (never fall back on generic advice):
- Do not string together sentences of generic advice such as 「大切です」「意識しましょう」「心がけましょう」. Always add a particular detail: an age, an amount, a place, a time of day, the name of an object.
- Every chapter must contain at least one scene in which a person actually does or says something. Show the realisation through action, not explanation; explanation comes briefly after the scene.
- Every chapter must portray one small conflict (hesitation, reluctance, a trade-off). Do not settle it with an easy answer; say what each choice costs.
- Use the video's central question and its recurring object or phrase (both given in the plan) in every chapter, with a slightly different meaning each time.
- Avoid repeating another chapter's form, opening or phrasing.
- Present characters as typical, fictional examples. Never pass them off as real people or as "a post sent in by a viewer".
- Write the plan's original elements concretely into the chapters they belong to.

About the reference videos:
- They are material for understanding the theme and what viewers care about. Do not copy their sentences, phrasing, concrete examples or order of points.
- Even for the same claim, retell it in your own words with your own examples, and always add a viewpoint the reference videos do not have.`;

function sourcesBlock(sources: ScriptSource[]): string {
  return sources
    .map((source, index) => `## Reference video ${index + 1}: ${source.title}\n${source.text}`)
    .join('\n\n');
}

export const FORM_GUIDE: Record<ChapterForm, string> = {
  scene:
    'Scene: show it through a short scene where who, where and when are clear. Put the realisation into the characters\' actions and dialogue; explain briefly after the scene.',
  reversal:
    'Reversal: state a widely held belief first, then overturn it with a concrete scene or fact.',
  dilemma:
    'Dilemma: depict two concrete options where either choice loses something, and say what each costs. Give no easy right answer.',
  consultation:
    'Consultation: take one common worry in the form 「こんな悩みをよく耳にします」. Never pass it off as a real individual or a submitted post.',
  experiment:
    'Experiment: propose one small action doable in a week, say what tends to happen when you try it, and where people tend to stumble.',
  before_after:
    'Before/after: play out the same situation handled in two ways and show the difference in outcome through behaviour.',
};

export const OPENING_GUIDE: Record<OpeningType, string> = {
  in_scene: 'Open in a scene (start with a person, a place or a time)',
  question: 'Open with a concrete question to the viewer',
  quote: 'Open with a line someone might say, in 「」',
  concrete_detail: 'Open with one concrete detail: an object, a number, a gesture',
  confession: 'Open as a confidence, in the manner of 「正直に言うと」',
  contrast: 'Open by setting two contrasting facts side by side',
};

function outlineBlock(outline: ScriptOutline): string {
  const { spine } = outline;
  const chapters = outline.chapters
    .map((chapter, index) =>
      [
        `${index + 1}. ${chapter.heading}`,
        `   Form: ${FORM_GUIDE[chapter.form]}`,
        `   Opening: ${OPENING_GUIDE[chapter.openingType]}`,
        `   Conflict: ${chapter.tension}`,
        `   Action scene: ${chapter.actionScene}`,
        `   To convey:\n   - ${chapter.keyPoints.join('\n   - ')}`,
      ].join('\n'),
    )
    .join('\n');
  return [
    `Title: ${outline.title}`,
    `Angle: ${outline.angle}`,
    `Hook: ${outline.hook}`,
    `Central question of the whole video: ${spine.centralQuestion}`,
    `Recurring object or phrase: ${spine.thread}`,
    `What the reference videos all say: ${spine.consensus}`,
    `Where this video differs or goes deeper: ${spine.ourTake}`,
    `Original elements (not in any reference video; write them in concretely):\n- ${spine.originalElements.join('\n- ')}`,
    `Chapters:\n${chapters}`,
  ].join('\n');
}

function chapterText(chapter: VideoAgentScriptChapter, index: number): string {
  return `## Chapter ${index + 1}: ${chapter.heading}\n${chapter.sentences.join('\n')}`;
}

function chapterChars(sentences: string[]): number {
  return sentences.join('').length;
}

/**
 * Writes or rewrites one chapter with the full text of every other chapter in view, so it can
 * pick up exactly where the previous chapter stopped, hand over to the next one, and avoid
 * reusing examples. `before` grows by one chapter per call; each chapter is its own content
 * block with a cache breakpoint on the last one, so the shared prefix is read from cache.
 */
async function writeChapter(params: {
  outline: ScriptOutline;
  sources: ScriptSource[];
  index: number;
  targetChars: number;
  /** Final text of the chapters that come before this one. */
  before: VideoAgentScriptChapter[];
  /** Set when revising: the chapters after this one, which stay unchanged. */
  after?: VideoAgentScriptChapter[];
  instructions?: string;
  currentText?: string;
  notes?: string;
  usage: VideoAgentUsage;
  signal?: AbortSignal;
}): Promise<string[]> {
  const { outline, index } = params;
  const chapter = outline.chapters[index];
  const next = outline.chapters[index + 1];
  const isFirst = index === 0;
  const isLast = index === outline.chapters.length - 1;
  const nextOpening = params.after?.[0]?.sentences.slice(0, 3).join('');

  const content: Anthropic.Beta.BetaTextBlockParam[] = params.before.map((done, doneIndex) => ({
    type: 'text',
    text: `${doneIndex === 0 ? '# Chapters already written (continue from here)\n' : ''}${chapterText(done, doneIndex)}`,
  }));
  if (content.length > 0) content[content.length - 1].cache_control = { type: 'ephemeral' };

  if (params.after?.length) {
    content.push({
      type: 'text',
      text: `# Chapters that follow this one (do not change them; do not repeat their content or examples)\n${params.after
        .map((later, laterIndex) => chapterText(later, index + 1 + laterIndex))
        .join('\n\n')}`,
    });
  }

  const task = [
    params.currentText
      ? `Rewrite Chapter ${index + 1} (${chapter.heading}) following these instructions.\nInstructions: ${params.instructions ?? ''}\n\nCurrent text:\n${params.currentText}`
      : `Write the narration for Chapter ${index + 1} (${chapter.heading}).`,
    `Target length: about ${params.targetChars} characters (±15%).`,
    `Form of this chapter: ${FORM_GUIDE[chapter.form]}`,
    `Opening of this chapter: ${OPENING_GUIDE[chapter.openingType]}.${isFirst ? '' : ' Pick up the end of the previous chapter while keeping this opening type.'}`,
    `Conflict of this chapter: ${chapter.tension}`,
    `Action scene of this chapter: ${chapter.actionScene}`,
    `This chapter answers part of the central question "${outline.spine.centralQuestion}". Bring in the recurring object or phrase "${outline.spine.thread}" at least once, with a meaning specific to this chapter.`,
    isFirst
      ? 'This is the opening: within the first 2-3 sentences touch the viewer\'s worry or a scene to make the hook, and within 30 seconds promise what the video will make clear. Do not read the chapter heading aloud.'
      : 'Start with a natural sentence that picks up the last few sentences of the previous chapter. Do not read the chapter heading aloud.',
    nextOpening
      ? `The next chapter begins "${nextOpening}". End this chapter so that it leads into that opening without a jolt.`
      : next
        ? `End this chapter with one or two sentences that lead naturally into Chapter ${index + 2} (${next.heading}) without giving away its content.`
        : '',
    isLast
      ? 'This is the last chapter: summarise the whole video briefly, close with reassuring words, and add one line inviting viewers to share their own experience in the comments.'
      : '',
    'When you have finished, check that read next to its neighbours the chapter keeps the story one thread, repeats no example, claim or opening, and has no paragraph of generic advice without a particular detail and a person acting. Then output it.',
    params.notes ? `Producer notes: ${params.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  content.push({ type: 'text', text: task });

  const response = await getClaudeClient().beta.messages.parse(
    {
      model: env.videoAgentModel,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: betaZodOutputFormat(ChapterOutput) },
      system: [
        { type: 'text', text: STYLE_RULES },
        // Sources + outline are identical for every chapter call, so they are cached once per script.
        {
          type: 'text',
          text: `# Reference videos\n${sourcesBlock(params.sources)}\n\n# Plan for the script\n${outlineBlock(outline)}`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content }],
    },
    { signal: params.signal },
  );

  addUsage(params.usage, env.videoAgentModel, response.usage);
  assertNotRefused(response);
  if (response.stop_reason === 'max_tokens') {
    throw new AppError(`Chương ${index + 1} bị cắt do max_tokens`, 500, 'SCRIPT_TRUNCATED');
  }
  const sentences = response.parsed_output?.sentences.map(s => s.trim()).filter(Boolean) ?? [];
  if (sentences.length === 0) {
    throw new AppError(`Claude không trả về câu nào cho chương ${index + 1}`, 500, 'SCRIPT_EMPTY');
  }
  return sentences;
}

/** Writes chapters in order; each one sees the full text of all chapters before it. */
export async function writeScript(params: {
  outline: ScriptOutline;
  sources: ScriptSource[];
  targetChars: number;
  notes?: string;
  usage: VideoAgentUsage;
  signal?: AbortSignal;
  onChapter?: (index: number, chars: number) => void;
}): Promise<VideoAgentScriptChapter[]> {
  const { outline } = params;
  const perChapter = Math.round(params.targetChars / outline.chapters.length);
  const chapters: VideoAgentScriptChapter[] = [];

  for (let index = 0; index < outline.chapters.length; index++) {
    const sentences = await writeChapter({
      ...params,
      index,
      targetChars: perChapter,
      before: chapters,
    });
    chapters.push({ heading: outline.chapters[index].heading, sentences });
    params.onChapter?.(index, chapterChars(sentences));
  }
  return chapters;
}

/**
 * Rewrites one chapter in place. The neighbours stay fixed, so the new text must open from the
 * previous chapter's ending and close into the next chapter's existing opening.
 */
export async function reviseChapter(params: {
  outline: ScriptOutline;
  sources: ScriptSource[];
  chapters: VideoAgentScriptChapter[];
  index: number;
  instructions: string;
  targetChars?: number;
  usage: VideoAgentUsage;
  signal?: AbortSignal;
}): Promise<string[]> {
  const current = params.chapters[params.index];
  if (!current) throw new AppError(`Không có chương ${params.index + 1}`, 400, 'VALIDATION_ERROR');
  return writeChapter({
    outline: params.outline,
    sources: params.sources,
    index: params.index,
    targetChars: params.targetChars ?? chapterChars(current.sentences),
    before: params.chapters.slice(0, params.index),
    after: params.chapters.slice(params.index + 1),
    instructions: params.instructions,
    currentText: current.sentences.join('\n'),
    usage: params.usage,
    signal: params.signal,
  });
}
