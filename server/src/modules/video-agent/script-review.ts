import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { addUsage, assertNotRefused, FALLBACK_BETA, getClaudeClient } from './claude.js';
import type { ScriptSource } from './script-writer.js';
import type { VideoAgentOutline, VideoAgentScriptChapter, VideoAgentScriptReview, VideoAgentUsage } from './video-agent.types.js';

/** At or above this share of the source's point sequence, the script counts as a structural copy. */
export const STRUCTURE_FAIL_PERCENT = 50;
/** A closing or recap chapter may explain; no more than this many chapters may. */
const MAX_EXPLANATION_CHAPTERS = 1;

const ReviewOutput = z.object({
  sources: z.array(
    z.object({
      sourceIndex: z.number().int().describe('1-based index of the source video.'),
      sharedStructurePercent: z
        .number()
        .describe('0-100: how much of the script follows the same main points in the same order as this source.'),
      reusedExamples: z
        .array(z.string())
        .describe('Distinctive examples, stories or metaphors taken from this source (short, in Vietnamese). Empty if none.'),
      reason: z.string().describe('One sentence in Vietnamese.'),
    }),
  ),
  repetitions: z
    .array(
      z.object({
        chapterA: z.number().int().describe('1-based.'),
        chapterB: z.number().int().describe('1-based, later than chapterA.'),
        what: z.string().describe('The repeated idea, example, opening move or sentence pattern, in Vietnamese.'),
      }),
    )
    .describe('Ideas, examples, punchlines, opening moves or sentence patterns that appear in more than one chapter.'),
  transitions: z
    .array(
      z.object({
        fromChapter: z.number().int().describe('1-based; the boundary between this chapter and the next.'),
        smooth: z.boolean(),
        note: z.string().describe('If not smooth: what breaks and how to fix it, in Vietnamese.'),
      }),
    )
    .describe('One entry per chapter boundary.'),
  arc: z.object({
    builds: z.boolean().describe('True when the video reads as one story that deepens towards the end.'),
    note: z.string().describe('In Vietnamese.'),
  }),
  chapters: z
    .array(
      z.object({
        chapter: z.number().int().describe('1-based.'),
        mode: z
          .enum(['action', 'explanation'])
          .describe('action: the lesson shows through what a person does or says in a scene. explanation: the chapter mostly states and explains.'),
        hasSpecificDetail: z
          .boolean()
          .describe('False if the chapter stays at generic advice with no particular age, amount, place, time or object.'),
        formFollowed: z.boolean().describe('Does the chapter actually follow its planned form, opening type and tension?'),
        note: z.string().describe('If something fails: what and how to fix, in Vietnamese. Otherwise empty.'),
      }),
    )
    .describe('One entry per chapter.'),
  originality: z
    .array(
      z.object({
        element: z.string().describe('The planned original element, copied from the plan.'),
        inScript: z.boolean().describe('Is it actually written into the script, concretely?'),
        inSources: z.boolean().describe('Is the same scene, reframing or step already in any source?'),
      }),
    )
    .describe('One entry per planned original element.'),
  thread: z.object({
    inEveryChapter: z.boolean().describe('Does the planned recurring object/phrase appear in every chapter?'),
    meaningShifts: z.boolean().describe('Does it mean something a little different each time, rather than being repeated verbatim?'),
    note: z.string().describe('In Vietnamese.'),
  }),
});

const REVIEW_PROMPT = `You are the editor of a Japanese YouTube channel for viewers aged 50-70. Review a narration script that was written from reference videos, against the plan it was written from.

The two worst outcomes are a script that reuses the reference videos, and a script that is generic and templated (every chapter the same shape, advice with nothing particular in it). Be strict on both.

Check:
1. Structural copying, per source: does the script walk through the same main points in the same order as the source, or reuse its distinctive examples, stories or metaphors? Shared general ideas are fine; a shared skeleton or borrowed examples are not.
2. Repetition between chapters: the same idea, example or punchline told twice, or the same opening move or sentence pattern repeated.
3. Every chapter boundary: does the next chapter open by picking up what the previous one ended on, and does the previous one end by leading into it? Abrupt topic jumps, mechanical openers ("2つ目は", "次に") with no link, or an ending that spoils the next chapter count as not smooth.
4. Arc: does the whole video read as one story that deepens (empathy → reasons → what to do and reassurance), so a viewer wants to keep watching?
5. Each chapter: is the lesson shown through what a person does or says (action) or only explained? Does it contain particular details (an age, an amount, a place, a time of day, an object) or stay at generic advice such as "it is important to...", "try to be mindful"? Does it really follow its planned form, opening type and tension?
6. Originality: for every planned original element, is it concretely written into the script, and is the same scene, reframing or step already present in any reference video?
7. Thread: does the planned recurring object or phrase appear in every chapter, with a slightly different meaning each time?

Judge only what is on the page. Write every note in Vietnamese so the producer can read it.`;

function planText(outline: VideoAgentOutline): string {
  const { spine } = outline;
  const chapters = outline.chapters
    .map(
      (chapter, index) =>
        `${index + 1}. ${chapter.heading} | form: ${chapter.form} | opening: ${chapter.openingType} | tension: ${chapter.tension} | scene: ${chapter.actionScene}`,
    )
    .join('\n');
  return [
    `Central question: ${spine.centralQuestion}`,
    `Recurring thread: ${spine.thread}`,
    `What all sources say: ${spine.consensus}`,
    `What this video does differently: ${spine.ourTake}`,
    `Planned original elements:\n- ${spine.originalElements.join('\n- ')}`,
    `Chapters:\n${chapters}`,
  ].join('\n');
}

export async function reviewScript(params: {
  outline: VideoAgentOutline;
  chapters: VideoAgentScriptChapter[];
  sources: ScriptSource[];
  usage: VideoAgentUsage;
  signal?: AbortSignal;
}): Promise<VideoAgentScriptReview> {
  const script = params.chapters
    .map((chapter, index) => `## Chapter ${index + 1}: ${chapter.heading}\n${chapter.sentences.join('\n')}`)
    .join('\n\n');
  const sources = params.sources
    .map((source, index) => `## Source ${index + 1}: ${source.title}\n${source.text}`)
    .join('\n\n');

  const response = await getClaudeClient().beta.messages.parse(
    {
      model: env.videoAgentModel,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: betaZodOutputFormat(ReviewOutput) },
      system: REVIEW_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `# Reference videos\n${sources}` },
            { type: 'text', text: `# Plan\n${planText(params.outline)}` },
            { type: 'text', text: `# Script: ${params.outline.title}\n${script}` },
          ],
        },
      ],
    },
    { signal: params.signal },
  );

  addUsage(params.usage, env.videoAgentModel, response.usage);
  assertNotRefused(response);
  const review = response.parsed_output;
  if (!review) throw new Error('Không đọc được kết quả kiểm cấu trúc');

  const sourcesResult = review.sources.map(item => ({
    ...item,
    pass: item.sharedStructurePercent < STRUCTURE_FAIL_PERCENT && item.reusedExamples.length === 0,
  }));
  const weakTransitions = review.transitions.filter(item => !item.smooth);
  const explanationChapters = review.chapters.filter(item => item.mode === 'explanation').length;
  const chaptersOk =
    explanationChapters <= MAX_EXPLANATION_CHAPTERS &&
    review.chapters.every(item => item.hasSpecificDetail && item.formFollowed);
  const originalityOk = review.originality.length > 0 && review.originality.every(item => item.inScript && !item.inSources);
  const threadOk = review.thread.inEveryChapter && review.thread.meaningShifts;

  return {
    sources: sourcesResult,
    repetitions: review.repetitions,
    transitions: review.transitions,
    arc: review.arc,
    chapters: review.chapters,
    originality: review.originality,
    thread: review.thread,
    pass:
      sourcesResult.every(item => item.pass) &&
      review.repetitions.length === 0 &&
      weakTransitions.length === 0 &&
      review.arc.builds &&
      chaptersOk &&
      originalityOk &&
      threadOk,
  };
}
