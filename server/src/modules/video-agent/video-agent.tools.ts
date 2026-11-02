import fs from 'node:fs/promises';
import path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { downloadYoutubeTranscript } from '../../infrastructure/youtube/youtube-transcript-downloader.js';
import { fetchYoutubeVideoTitle } from '../../infrastructure/youtube/youtube-video-title.js';
import { requireYoutubeVideoId } from '../../infrastructure/youtube/youtube-url.js';
import { AppError } from '../../shared/http/errors.js';
import { appSettingsService } from '../app-settings/app-settings.service.js';
import { promptsRepository } from '../prompts/prompts.repository.js';
import { createYoutubeProductionDestination } from '../video-production/adapters/youtube-production-destination.adapter.js';
import type { ProductionDestination } from '../video-production/ports/production-destination.port.js';
import { resolveAiRenderConfig } from '../video-production/shared/ai-video/ai-render-config.js';
import {
  assembleReupAiSlideshowVideo,
  generateAiScenePromptsForPipeline,
  generateAiSceneSlideImages,
} from '../video-production/shared/ai-video/index.js';
import { isKenBurnsEnabled } from '../video-production/shared/slideshow/slideshow.constants.js';
import { resolveChannelAvatarForVideoAssembly } from '../youtube-channels/resolve-channel-avatar.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import { checkChannelFreshness } from './channel-freshness.js';
import { synthesizeNarration, writeProvisionalSubtitle } from './narration.js';
import { retimeScenesToSubtitle, SCENES_FILE, snapshotSceneTiming } from './scene-retime.js';
import { validateOutline } from './outline-rules.js';
import { NARRATION_CHARS_PER_MIN, reviseChapter, writeScript, type ScriptSource } from './script-writer.js';
import { reviewScript, STRUCTURE_FAIL_PERCENT } from './script-review.js';
import { ngramContainment, SIMILARITY_LIMITS } from './similarity.js';
import { videoAgentRepository } from './video-agent.repository.js';
import {
  CHAPTER_FORMS,
  OPENING_TYPES,
  VIDEO_MAX_MINUTES,
  VIDEO_MIN_MINUTES,
  type VideoAgentNarrationFit,
  type VideoAgentRun,
  type VideoAgentScript,
  type VideoAgentStage,
  type VideoAgentUsage,
} from './video-agent.types.js';

export interface ToolContext {
  run: VideoAgentRun;
  workDir: string;
  usage: VideoAgentUsage;
  signal: AbortSignal;
  /** Progress line in the run timeline. */
  note: (title: string, detail?: string) => void;
  markStage: (stage: VideoAgentStage) => void;
}

/** `pause` stops the loop until the user answers; everything else is returned to Claude as-is. */
export type ToolOutcome = { content: string } | { pause: 'approval'; summary: string };

interface ToolSpec<S extends z.ZodType> {
  name: string;
  description: string;
  schema: S;
  stage?: VideoAgentStage;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<ToolOutcome>;
}

function defineTool<S extends z.ZodType>(spec: ToolSpec<S>): ToolSpec<S> {
  return spec;
}

const outlineSchema = z.object({
  title: z.string().describe('Japanese video title. Your own wording - never the source title verbatim.'),
  angle: z.string().describe('One sentence: the new perspective this video adds compared with the sources.'),
  hook: z.string().describe('What the first 30 seconds say to make a 60+ viewer stay.'),
  spine: z.object({
    centralQuestion: z
      .string()
      .describe('One question the whole video answers; each chapter answers a part and the full answer lands at the end.'),
    thread: z
      .string()
      .describe('A recurring object, phrase or situation (e.g. an unopened bankbook) that returns in every chapter with a slightly different meaning.'),
    consensus: z.string().describe('What every source video says (the ground everyone covers).'),
    ourTake: z.string().describe('Where this video deliberately goes deeper or differently than that consensus.'),
    originalElements: z
      .array(z.string())
      .min(3)
      .describe(
        'At least 3 concrete elements found in NO source: a specific scene, a reframing, a practical step doable this week, an everyday Japanese anchor (e.g. お盆, 年金, 町内会). One sentence each, specific enough to check.',
      ),
  }),
  chapters: z
    .array(
      z.object({
        heading: z.string().describe('Short Japanese chapter heading (used for YouTube chapters).'),
        keyPoints: z.array(z.string()).min(1).describe('What this chapter must convey.'),
        form: z
          .enum(CHAPTER_FORMS)
          .describe('How the chapter is told. Adjacent chapters must differ; use at least 3 different forms, none more than twice.'),
        openingType: z.enum(OPENING_TYPES).describe('How the chapter starts. Adjacent chapters must differ.'),
        tension: z
          .string()
          .min(10)
          .describe('The small conflict: a hesitation, a trade-off, a choice that costs something either way.'),
        actionScene: z
          .string()
          .min(10)
          .describe('The concrete scene (who, where, doing or saying what) through which the lesson shows.'),
      }),
    )
    .min(3)
    .max(12),
});

/** yt-dlp first (same as the rest of dammo), then YouTube oEmbed, which needs no binary. */
async function fetchSourceTitle(url: string, videoId: string): Promise<string> {
  try {
    return await fetchYoutubeVideoTitle(url);
  } catch {
    try {
      const res = await fetch(`https://www.youtube.com/oembed?${new URLSearchParams({ url, format: 'json' })}`);
      if (res.ok) return ((await res.json()) as { title?: string }).title?.trim() || videoId;
    } catch {
      // fall through
    }
    return videoId;
  }
}

async function loadScriptSources(run: VideoAgentRun): Promise<ScriptSource[]> {
  const sources: ScriptSource[] = [];
  for (const info of run.artifacts.sources) {
    sources.push({ title: info.title, text: await fs.readFile(info.transcriptPath, 'utf8') });
  }
  return sources;
}

function scriptText(script: VideoAgentScript): string {
  return script.chapters
    .map((chapter, index) => `## ${index + 1}. ${chapter.heading}\n${chapter.sentences.join('\n')}`)
    .join('\n\n');
}

async function finalizeScript(
  ctx: ToolContext,
  script: Pick<VideoAgentScript, 'outline' | 'chapters' | 'plannedMinutes' | 'lengthReason'>,
  sources: ScriptSource[],
  options: { keepApproval?: boolean } = {},
): Promise<VideoAgentScript> {
  const body = script.chapters.map(chapter => chapter.sentences.join('')).join('');
  ctx.note('Biên tập viên AI đọc lại toàn bộ kịch bản');
  const review = await reviewScript({ ...script, sources, usage: ctx.usage, signal: ctx.signal });
  const freshness = checkChannelFreshness({
    runId: ctx.run.id,
    channelId: ctx.run.input.channelId,
    outline: script.outline,
    chapters: script.chapters,
  });
  const full: VideoAgentScript = {
    ...script,
    totalChars: body.length,
    estimatedMinutes: Math.round((body.length / NARRATION_CHARS_PER_MIN) * 10) / 10,
    similarity: ctx.run.artifacts.sources.map((source, index) => ({
      sourceVideoId: source.videoId,
      gram8: ngramContainment(body, sources[index]?.text ?? '', 8),
      gram15: ngramContainment(body, sources[index]?.text ?? '', 15),
    })),
    review,
    freshness,
    updatedAt: new Date().toISOString(),
  };
  const scriptPath = path.join(ctx.workDir, 'script.json');
  await fs.writeFile(scriptPath, JSON.stringify(full, null, 2), 'utf8');
  await fs.writeFile(path.join(ctx.workDir, 'script.txt'), `${full.outline.title}\n\n${scriptText(full)}\n`, 'utf8');
  ctx.run.script = full;
  ctx.run.title = full.outline.title;
  ctx.run.artifacts.scriptPath = scriptPath;
  // A changed script invalidates the narration and everything built on it; content changes also
  // invalidate the approval, while a post-voice length trim keeps what the producer approved.
  const kept = options.keepApproval ? ['source', 'script', 'approval'] : ['source', 'script'];
  ctx.run.stagesDone = ctx.run.stagesDone.filter(stage => kept.includes(stage));
  if (!options.keepApproval) ctx.run.artifacts.narrationFit = undefined;
  return full;
}

function reviewReport(script: VideoAgentScript): string[] {
  const review = script.review;
  if (!review) return [];
  const lines = [`Editor review: ${review.pass ? 'PASS' : 'FAIL'}`];
  for (const source of review.sources) {
    const reused = source.reusedExamples.length ? `; reused examples: ${source.reusedExamples.join(' / ')}` : '';
    lines.push(
      `- Source ${source.sourceIndex}: shares ${source.sharedStructurePercent}% of its point sequence (limit <${STRUCTURE_FAIL_PERCENT}%)${reused} → ${source.pass ? 'pass' : 'FAIL'} — ${source.reason}`,
    );
  }
  for (const item of review.repetitions) {
    lines.push(`- Repetition ch${item.chapterA} & ch${item.chapterB}: ${item.what}`);
  }
  for (const item of review.transitions) {
    lines.push(`- Hand-off ch${item.fromChapter}→ch${item.fromChapter + 1}: ${item.smooth ? 'smooth' : `WEAK — ${item.note}`}`);
  }
  lines.push(`- Arc: ${review.arc.builds ? 'builds' : 'DOES NOT BUILD'} — ${review.arc.note}`);
  for (const item of review.chapters) {
    const problems = [
      item.mode === 'explanation' ? 'mostly EXPLANATION (show it through a scene)' : '',
      item.hasSpecificDetail ? '' : 'GENERIC (no particular age/amount/place/time/object)',
      item.formFollowed ? '' : 'does NOT follow its planned form/opening/tension',
    ].filter(Boolean);
    if (problems.length > 0) lines.push(`- Chapter ${item.chapter}: ${problems.join('; ')} — ${item.note}`);
  }
  for (const item of review.originality) {
    if (!item.inScript || item.inSources) {
      lines.push(
        `- Original element "${item.element}": ${!item.inScript ? 'NOT written into the script' : 'ALREADY IN A SOURCE (not original)'}`,
      );
    }
  }
  if (!review.thread.inEveryChapter || !review.thread.meaningShifts) {
    lines.push(`- Thread: ${review.thread.inEveryChapter ? '' : 'missing in some chapters; '}${review.thread.meaningShifts ? '' : 'repeated without shifting meaning; '}${review.thread.note}`);
  }
  return lines;
}

function freshnessReport(script: VideoAgentScript): string[] {
  const freshness = script.freshness;
  if (!freshness) return [];
  const lines = [`Channel freshness (vs ${freshness.compared} earlier videos of this channel): ${freshness.pass ? 'PASS' : 'FAIL'}`];
  for (const issue of freshness.issues) lines.push(`- [${issue.kind}] ${issue.message}`);
  return lines;
}

function scriptReport(script: VideoAgentScript): string {
  const worst = script.similarity.reduce(
    (acc, item) => ({ gram8: Math.max(acc.gram8, item.gram8), gram15: Math.max(acc.gram15, item.gram15) }),
    { gram8: 0, gram15: 0 },
  );
  const passed = worst.gram8 <= SIMILARITY_LIMITS.gram8 && worst.gram15 <= SIMILARITY_LIMITS.gram15;
  const perChapter = script.chapters
    .map((chapter, index) => `${index + 1}. ${chapter.heading}: ${chapter.sentences.join('').length} chars`)
    .join('\n');
  return [
    `Planned length (your choice): ${script.plannedMinutes} min. Written: ${script.totalChars} chars ≈ ${script.estimatedMinutes} min of narration (allowed window ${VIDEO_MIN_MINUTES}-${VIDEO_MAX_MINUTES} min).`,
    perChapter,
    `Wording similarity vs sources (max): 8-gram ${worst.gram8}% (limit ${SIMILARITY_LIMITS.gram8}%), 15-gram ${worst.gram15}% (limit ${SIMILARITY_LIMITS.gram15}%) → ${passed ? 'PASS' : 'FAIL - rewrite the chapters that copy the sources'}.`,
    ...reviewReport(script),
    ...freshnessReport(script),
    '',
    scriptText(script),
  ].join('\n');
}

/** Above this deviation from the target runtime the agent is asked to trim or extend and re-voice. */
const LENGTH_TOLERANCE_PERCENT = 10;

function narrationReport(fit: VideoAgentNarrationFit, script: VideoAgentScript): string {
  const perChapter = fit.chapters
    .map((chapter, index) => `${index + 1}. ${script.chapters[index]?.heading}: ${chapter.chars} chars, ${Math.round(chapter.seconds)} s`)
    .join('\n');
  const lines = [
    `Narration: ${fit.actualMinutes} min vs target ${fit.targetMinutes} min (${fit.deviationPercent > 0 ? '+' : ''}${fit.deviationPercent}%). Measured pace ${fit.charsPerMinute} chars/min.`,
    perChapter,
  ];
  // A video that lands outside the 12-30 minute window needs fixing even when it is close to its own plan.
  const outsideWindow = fit.actualMinutes < VIDEO_MIN_MINUTES || fit.actualMinutes > VIDEO_MAX_MINUTES;
  if (!outsideWindow && Math.abs(fit.deviationPercent) <= LENGTH_TOLERANCE_PERCENT) {
    lines.push(`IN RANGE (±${LENGTH_TOLERANCE_PERCENT}% of your plan, inside ${VIDEO_MIN_MINUTES}-${VIDEO_MAX_MINUTES} min). Continue with generate_scene_images.`);
    return lines.join('\n');
  }
  const aimMinutes = Math.min(Math.max(fit.targetMinutes, VIDEO_MIN_MINUTES + 0.3), VIDEO_MAX_MINUTES - 0.3);
  const deltaChars = Math.round((aimMinutes - fit.actualMinutes) * fit.charsPerMinute);
  const ranked = fit.chapters
    .map((chapter, index) => ({ index, chars: chapter.chars }))
    .sort((a, b) => (deltaChars < 0 ? b.chars - a.chars : a.chars - b.chars))
    .slice(0, 2);
  const share = Math.round(deltaChars / ranked.length);
  lines.push(
    `OUT OF RANGE${outsideWindow ? ` (outside the ${VIDEO_MIN_MINUTES}-${VIDEO_MAX_MINUTES} min window)` : ''}: ${deltaChars > 0 ? 'add' : 'cut'} about ${Math.abs(deltaChars)} chars in total. Suggested: ${ranked
      .map(item => `ch${item.index + 1} ${share > 0 ? '+' : ''}${share} chars`)
      .join(', ')}. Use revise_chapter with keepApproval=true (deepen an example or tighten wording; keep the hand-offs to neighbouring chapters), then call synthesize_voice again. At most 2 rounds; then continue even if still slightly off.`,
  );
  return lines.join('\n');
}

async function resolveDestination(run: VideoAgentRun): Promise<ProductionDestination> {
  const channel = youtubeChannelsRepository.findById(run.input.channelId);
  if (!channel) throw new AppError('Kênh đích không còn tồn tại', 404, 'NOT_FOUND');
  const destination = await createYoutubeProductionDestination(channel);
  if (!destination.visualStyle) {
    throw new AppError(`Kênh "${channel.name}" chưa gắn visual style — vào cấu hình kênh để chọn`, 400, 'VALIDATION_ERROR');
  }
  return destination;
}

function requireStage(run: VideoAgentRun, stage: VideoAgentStage, message: string): void {
  if (!run.stagesDone.includes(stage)) throw new AppError(message, 409, 'STAGE_ORDER');
}

const tools = [
  defineTool({
    name: 'load_sources',
    stage: 'source',
    description:
      'Download title and Japanese transcript of every source video given by the user. Call this first. Returns the full transcripts.',
    schema: z.object({}),
    async run(_input, ctx) {
      const sources = [];
      const sourcesDir = path.join(ctx.workDir, 'sources');
      for (const url of ctx.run.input.sourceUrls) {
        ctx.signal.throwIfAborted();
        const videoId = requireYoutubeVideoId(url);
        ctx.note(`Tải transcript ${videoId}`);
        const [title, vttPath] = await Promise.all([
          fetchSourceTitle(url, videoId),
          downloadYoutubeTranscript(url, path.join(sourcesDir, videoId), 'ja'),
        ]);
        const text = (await fs.readFile(vttPath, 'utf8'))
          .split(/\r?\n/)
          .filter(line => line.trim() && !line.includes('-->') && line.trim() !== 'WEBVTT' && !/^\d+$/.test(line.trim()))
          .join('')
          .replace(/<[^>]+>/g, '')
          // Caption cues such as [音楽] / [拍手] are not narration.
          .replace(/\[[^\]]{1,10}\]/g, '');
        const transcriptPath = path.join(sourcesDir, `${videoId}.txt`);
        await fs.writeFile(transcriptPath, text, 'utf8');
        sources.push({ url, videoId, title, transcriptChars: text.length, transcriptPath, text });
      }
      ctx.run.artifacts.sources = sources.map(({ text: _text, ...info }) => info);
      return {
        content: sources
          .map(
            (source, index) =>
              `## Source ${index + 1}: ${source.title} (${source.videoId}, ${source.transcriptChars} chars ≈ ${Math.round(source.transcriptChars / NARRATION_CHARS_PER_MIN)} min)\n${source.text}`,
          )
          .join('\n\n'),
      };
    },
  }),

  defineTool({
    name: 'get_channel_profile',
    description:
      'Target channel settings (language, niche, visual style) and titles this agent already produced for it, so you avoid repeating an idea.',
    schema: z.object({}),
    async run(_input, ctx) {
      const destination = await resolveDestination(ctx.run);
      const previousTitles = videoAgentRepository
        .findAll()
        .filter(run => run.id !== ctx.run.id && run.input.channelId === ctx.run.input.channelId && run.title)
        .slice(0, 30)
        .map(run => `- ${run.title}`);
      return {
        content: [
          `Channel: ${destination.name}`,
          `Language: ${destination.language}`,
          `Niche: ${destination.niche}`,
          `Visual style: ${destination.visualStyle?.name} — ${destination.visualStyle?.rule}`,
          `Reference characters: ${destination.useReferenceImage ? 'yes (fixed mascot cast)' : 'no'}`,
          `Previous agent titles on this channel:\n${previousTitles.join('\n') || '(none)'}`,
        ].join('\n'),
      };
    },
  }),

  defineTool({
    name: 'write_script',
    stage: 'script',
    description:
      'Expand your outline into the full Japanese narration chapter by chapter (each chapter sees every chapter written before it and is written in its own planned form). The outline is rejected up front if it is one mould: adjacent chapters with the same form or opening, fewer than 3 distinct forms, fewer than 3 original elements. The report covers length, wording similarity to the sources, an editor review (structural copying, repetition, hand-offs, arc, action vs explanation, concrete detail, original elements, thread) and a freshness check against the channel\'s earlier videos. Calling it again replaces the whole script.',
    schema: z.object({
      outline: outlineSchema,
      targetMinutes: z
        .number()
        .int()
        .min(VIDEO_MIN_MINUTES)
        .max(VIDEO_MAX_MINUTES)
        .describe(
          `Runtime YOU chose for this video, ${VIDEO_MIN_MINUTES}-${VIDEO_MAX_MINUTES} minutes (~${NARRATION_CHARS_PER_MIN} chars of narration per minute), decided from how much distinct, concrete material the topic supports.`,
        ),
      lengthReason: z
        .string()
        .min(20)
        .describe(
          'In Vietnamese: why this length. Name the amount of distinct material (how many chapters with their own scene and point), what the sources cover and what you add. Never "to reach the minimum".',
        ),
    }),
    async run(input, ctx) {
      requireStage(ctx.run, 'source', 'Gọi load_sources trước khi viết kịch bản');
      const problems = validateOutline(input.outline, input.targetMinutes);
      if (problems.length > 0) {
        throw new AppError(
          `Dàn ý chưa đạt, sửa rồi gọi lại write_script:\n- ${problems.join('\n- ')}`,
          400,
          'OUTLINE_REJECTED',
        );
      }
      const sources = await loadScriptSources(ctx.run);
      ctx.note(
        `Agent chọn ${input.targetMinutes} phút cho ${input.outline.chapters.length} chương`,
        input.lengthReason,
      );
      const chapters = await writeScript({
        outline: input.outline,
        sources,
        targetChars: input.targetMinutes * NARRATION_CHARS_PER_MIN,
        notes: ctx.run.input.notes,
        usage: ctx.usage,
        signal: ctx.signal,
        onChapter: (index, chars) => ctx.note(`Xong chương ${index + 1}/${input.outline.chapters.length}`, `${chars} ký tự`),
      });
      const script = await finalizeScript(
        ctx,
        { outline: input.outline, chapters, plannedMinutes: input.targetMinutes, lengthReason: input.lengthReason },
        sources,
      );
      return { content: scriptReport(script) };
    },
  }),

  defineTool({
    name: 'revise_chapter',
    stage: 'script',
    description:
      'Rewrite one chapter of the current script with specific instructions (copied structure, repetition, weak hand-off, length, producer feedback...). The neighbouring chapters stay as they are and the rewrite is made to open from the previous chapter and lead into the next one. The editor review runs again afterwards.',
    schema: z.object({
      chapterIndex: z.number().int().min(0).describe('0-based chapter index.'),
      instructions: z.string().describe('What to change, in any language.'),
      targetChars: z.number().int().min(200).max(4000).optional(),
      keepApproval: z
        .boolean()
        .optional()
        .describe('true ONLY for length adjustments asked for by synthesize_voice after the producer approved; keeps the approval.'),
    }),
    async run(input, ctx) {
      const current = ctx.run.script;
      if (!current) throw new AppError('Chưa có kịch bản để sửa', 409, 'STAGE_ORDER');
      if (!current.outline.spine || !current.outline.chapters[0]?.form) {
        throw new AppError('Kịch bản này tạo trước khi có xương sống/hình thức chương; gọi lại write_script với dàn ý mới', 409, 'STAGE_ORDER');
      }
      if (input.chapterIndex >= current.chapters.length) {
        throw new AppError(`Kịch bản chỉ có ${current.chapters.length} chương`, 400, 'VALIDATION_ERROR');
      }
      if (input.keepApproval && !(ctx.run.stagesDone.includes('approval') && ctx.run.artifacts.narrationFit)) {
        throw new AppError('keepApproval chỉ dùng để chỉnh độ dài sau khi đã duyệt và đã đọc giọng', 409, 'STAGE_ORDER');
      }
      const sources = await loadScriptSources(ctx.run);
      ctx.note(`Sửa chương ${input.chapterIndex + 1}`, input.instructions);
      const sentences = await reviseChapter({
        outline: current.outline,
        sources,
        chapters: current.chapters,
        index: input.chapterIndex,
        instructions: input.instructions,
        targetChars: input.targetChars,
        usage: ctx.usage,
        signal: ctx.signal,
      });
      const chapters = current.chapters.map((chapter, index) =>
        index === input.chapterIndex ? { ...chapter, sentences } : chapter,
      );
      const script = await finalizeScript(
        ctx,
        {
          outline: current.outline,
          chapters,
          plannedMinutes: current.plannedMinutes,
          lengthReason: current.lengthReason,
        },
        sources,
        { keepApproval: input.keepApproval },
      );
      return { content: scriptReport(script) };
    },
  }),

  defineTool({
    name: 'request_approval',
    stage: 'approval',
    description:
      'Show the finished script to the human producer and wait. The result tells you whether it was approved, plus any feedback to apply before continuing.',
    schema: z.object({
      summary: z.string().describe('Short note in Vietnamese for the producer: angle, length, similarity, anything they should check.'),
    }),
    async run(input, ctx) {
      if (!ctx.run.script) throw new AppError('Chưa có kịch bản để duyệt', 409, 'STAGE_ORDER');
      if (!ctx.run.input.requireApproval) {
        return { content: 'Approval is disabled for this run - the script counts as approved. Continue.' };
      }
      return { pause: 'approval', summary: input.summary };
    },
  }),

  defineTool({
    name: 'synthesize_voice',
    stage: 'voice',
    description:
      'Read the approved script aloud with VOICEVOX, build the subtitle track from the real audio timing, and report the real length against the target. Unchanged sentences are reused from cache, so calling it again after a length fix is cheap.',
    schema: z.object({}),
    async run(_input, ctx) {
      const { run } = ctx;
      if (!run.script) throw new AppError('Chưa có kịch bản', 409, 'STAGE_ORDER');
      if (run.input.requireApproval) requireStage(run, 'approval', 'Kịch bản chưa được duyệt — gọi request_approval');
      let lastNote = 0;
      const result = await synthesizeNarration({
        workDir: ctx.workDir,
        chapters: run.script.chapters,
        speaker: run.input.voicevoxSpeaker,
        speedScale: run.input.speedScale,
        signal: ctx.signal,
        onProgress: (done, total) => {
          if (done === total || Date.now() - lastNote > 15000) {
            lastNote = Date.now();
            ctx.note(`Đọc giọng ${done}/${total} câu`);
          }
        },
      });
      run.artifacts.audioPath = result.audioPath;
      run.artifacts.subtitlePath = result.subtitlePath;
      run.artifacts.audioDurationSec = result.durationSec;
      const actualMinutes = result.durationSec / 60;
      const spokenSeconds = result.chapterSeconds.reduce((sum, seconds) => sum + seconds, 0);
      const plannedMinutes = run.script.plannedMinutes;
      const fit: VideoAgentNarrationFit = {
        actualMinutes: Math.round(actualMinutes * 10) / 10,
        targetMinutes: plannedMinutes,
        deviationPercent: Math.round(((actualMinutes - plannedMinutes) / plannedMinutes) * 1000) / 10,
        charsPerMinute: Math.round(run.script.totalChars / (spokenSeconds / 60)),
        chapters: run.script.chapters.map((chapter, index) => ({
          chars: chapter.sentences.join('').length,
          seconds: result.chapterSeconds[index] ?? 0,
        })),
      };
      run.artifacts.narrationFit = fit;
      // Scenes made before (or for an earlier take of) this voice are moved onto its real timing.
      const retimed = await retimeScenesToSubtitle(ctx.workDir, result.subtitlePath);
      if (retimed || run.artifacts.sceneTimingBasis === 'provisional') {
        run.artifacts.sceneTimingBasis = 'voice';
        ctx.note('Khớp lại thời gian các scene theo giọng đọc thật');
      }
      return { content: narrationReport(fit, run.script) };
    },
  }),

  defineTool({
    name: 'generate_scene_images',
    stage: 'scenes',
    description:
      "Split the script into scenes and draw one image per scene in the channel's visual style (existing dammo image flow). Needs an approved script; it does not need the voice: without it the scenes are cut on estimated timing and re-timed automatically once the voice exists. Slow: minutes to an hour.",
    schema: z.object({}),
    async run(_input, ctx) {
      const { run } = ctx;
      if (!run.script) throw new AppError('Chưa có kịch bản', 409, 'STAGE_ORDER');
      if (run.input.requireApproval) requireStage(run, 'approval', 'Kịch bản chưa được duyệt — gọi request_approval');
      const destination = await resolveDestination(run);
      // Real voice timing when it exists; otherwise estimated timing from the script, re-timed after voicing.
      const voiced = run.stagesDone.includes('voice') && Boolean(run.artifacts.subtitlePath);
      const subtitlePath = voiced
        ? run.artifacts.subtitlePath!
        : await writeProvisionalSubtitle({ workDir: ctx.workDir, chapters: run.script.chapters, speedScale: run.input.speedScale });
      if (!voiced) ctx.note('Chưa có giọng đọc — chia scene theo thời lượng ước tính, sẽ khớp lại khi đọc giọng xong');
      const useReferenceImage = destination.useReferenceImage === true;
      const sceneImageFlow = promptsRepository.findImageSceneFlow(destination.niche, useReferenceImage);
      if (!sceneImageFlow) {
        throw new AppError(`Không có luồng prompt tạo ảnh cho niche "${destination.niche}"`, 400, 'IMAGE_SCENE_FLOW_NOT_FOUND');
      }
      const onLog = (msg: string) => ctx.note(msg);

      ctx.note(`Viết prompt scene (${sceneImageFlow.setName})`);
      const prompts = await generateAiScenePromptsForPipeline({
        workDir: ctx.workDir,
        channelId: destination.id,
        youtubeVideoId: run.id,
        visualStyle: destination.visualStyle!,
        subtitlePath,
        ...(voiced && run.artifacts.audioPath ? { audioPath: run.artifacts.audioPath } : {}),
        language: destination.language,
        detectedNiche: destination.niche,
        densityMaxSceneSec: destination.aiSceneDensityMaxSec,
        useReferenceImage,
        sceneImageFlow,
        onLog,
      });
      run.artifacts.scenePromptsPath = prompts.filePath;
      run.artifacts.sceneCount = prompts.scenes.length;
      ctx.signal.throwIfAborted();

      const renderConfig = await resolveAiRenderConfig(ctx.workDir, { kenBurns: isKenBurnsEnabled() });
      const settings = appSettingsService.get();
      ctx.note(`Vẽ ${prompts.scenes.length} ảnh scene`);
      const images = await generateAiSceneSlideImages({
        workDir: ctx.workDir,
        channelId: destination.id,
        youtubeVideoId: run.id,
        scenes: prompts.scenes,
        audioSpeed: renderConfig.audioSpeed,
        kenBurns: settings.kenBurnsOnPrepare && settings.enableKenBurns,
        onLog,
      });
      run.artifacts.imagesGenerated = images.generatedCount + images.skippedCount;
      await fs.writeFile(path.join(ctx.workDir, SCENES_FILE), JSON.stringify(images.scenes, null, 2), 'utf8');
      await snapshotSceneTiming(ctx.workDir, subtitlePath);
      run.artifacts.sceneTimingBasis = voiced ? 'voice' : 'provisional';
      // The voice may have finished while these images were drawn (the steps can run side by side).
      if (!voiced && run.stagesDone.includes('voice') && run.artifacts.subtitlePath) {
        if (await retimeScenesToSubtitle(ctx.workDir, run.artifacts.subtitlePath)) run.artifacts.sceneTimingBasis = 'voice';
      }
      return {
        content: `Scenes: ${prompts.scenes.length}. Images: ${images.generatedCount} generated, ${images.skippedCount} reused, ${images.failedCount} failed.`,
      };
    },
  }),

  defineTool({
    name: 'assemble_video',
    stage: 'video',
    description: 'Render the final 1080p video: scene images with Ken Burns, narration, burned-in Japanese captions.',
    schema: z.object({}),
    async run(_input, ctx) {
      const { run } = ctx;
      requireStage(run, 'voice', 'Chưa có giọng đọc — gọi synthesize_voice trước');
      requireStage(run, 'scenes', 'Chưa có ảnh scene — gọi generate_scene_images trước');
      const destination = await resolveDestination(run);
      // Safety net: scenes must follow the voice being rendered, even if it was re-made after them.
      if (await retimeScenesToSubtitle(ctx.workDir, run.artifacts.subtitlePath!)) {
        run.artifacts.sceneTimingBasis = 'voice';
        ctx.note('Khớp lại thời gian các scene theo giọng đọc thật');
      }
      const scenes = JSON.parse(await fs.readFile(path.join(ctx.workDir, SCENES_FILE), 'utf8'));
      const channelAvatarPath = await resolveChannelAvatarForVideoAssembly(destination.id, {
        enabled: destination.showChannelAvatar,
      });
      ctx.note('Dựng video (ffmpeg)');
      const videoPath = await assembleReupAiSlideshowVideo({
        workDir: ctx.workDir,
        scenes,
        audioPath: run.artifacts.audioPath!,
        subtitlePath: run.artifacts.subtitlePath!,
        language: destination.language,
        captionStyleKey: destination.captionStyleKey,
        outputBasename: 'video',
        ...(channelAvatarPath ? { channelAvatarPath } : {}),
        onLog: msg => ctx.note(msg),
      });
      run.artifacts.videoPath = videoPath;
      return { content: `Video rendered: ${path.basename(videoPath)}` };
    },
  }),
];

export const VIDEO_AGENT_TOOLS: Anthropic.Beta.BetaTool[] = tools.map(tool => {
  const { $schema: _schema, ...inputSchema } = z.toJSONSchema(tool.schema) as Record<string, unknown>;
  return {
    name: tool.name,
    description: tool.description,
    input_schema: inputSchema as Anthropic.Beta.BetaTool.InputSchema,
  };
});

export async function executeVideoAgentTool(
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const tool = tools.find(candidate => candidate.name === name);
  if (!tool) throw new AppError(`Unknown tool ${name}`, 400, 'UNKNOWN_TOOL');
  const parsed = tool.schema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    throw new AppError(`Invalid input for ${name}: ${parsed.error.message}`, 400, 'INVALID_TOOL_INPUT');
  }
  const outcome = await (tool.run as (input: unknown, ctx: ToolContext) => Promise<ToolOutcome>)(parsed.data, ctx);
  if (tool.stage && 'content' in outcome) ctx.markStage(tool.stage);
  return outcome;
}
