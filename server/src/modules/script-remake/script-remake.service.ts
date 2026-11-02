import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { paths } from '../../config/paths.js';
import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';
import { contentDownloadService } from '../content-download/content-download.service.js';
import type { LlmBrowserResponse, LlmTextProvider } from '../llm-browser/core/types.js';
import { llmBrowserService } from '../llm-browser/text/text.service.js';
import { executePromptTemplate } from '../prompts/prompts.file-store.js';
import { promptsRepository } from '../prompts/prompts.repository.js';
import { promptsSettingsService } from '../prompts/prompts-settings.service.js';
import type { PromptLanguage, PromptSet } from '../prompts/prompts.types.js';
import { validateLength } from '../video-agent/outline-rules.js';
import { ngramContainment } from '../video-agent/similarity.js';
import { VIDEO_MAX_MINUTES, VIDEO_MIN_MINUTES } from '../video-agent/video-agent.types.js';
import { assertRemakeStep1Current, ensureDefaultRemakePrompts } from './script-remake.default-prompts.js';

/** Narration pace used for length planning (~330 chars/min, same as the video agent). */
const CHARS_PER_MIN = 330;
const RESPONSE_TIMEOUT_MS = 6 * 60_000;
const MAX_LOGS = 200;
/** How many times a plan with an invalid length is sent back to the LLM before the job fails. */
const MAX_LENGTH_FIXES = 2;

function lengthFixPrompt(problems: string[]): string {
  return [
    'The length check rejected your plan:',
    ...problems.map(problem => `- ${problem}`),
    '',
    `Output the whole plan again as one JSON code block in the same format, with a corrected targetMinutes (an integer from ${VIDEO_MIN_MINUTES} to ${VIDEO_MAX_MINUTES}) and/or a different number of chapters. Do not pad: if the material is thin, shorten the video or pick a stronger angle.`,
  ].join('\n');
}

const outlineSchema = z.object({
  title: z.string().min(1),
  angle: z.string().default(''),
  hook: z.string().default(''),
  /** Runtime the planner chose, VIDEO_MIN_MINUTES..VIDEO_MAX_MINUTES. */
  targetMinutes: z.coerce.number().int().optional(),
  lengthReason: z.string().default(''),
  chapters: z
    .array(z.object({ heading: z.string().min(1), keyPoints: z.array(z.string()).default([]) }))
    .min(1),
});

export type RemakeOutline = z.infer<typeof outlineSchema>;

export interface RemakeChapter {
  heading: string;
  sentences: string[];
}

export interface RemakeResult {
  outline: RemakeOutline;
  chapters: RemakeChapter[];
  plannedMinutes: number;
  lengthReason: string;
  totalChars: number;
  estimatedMinutes: number;
  /** % of the remake's character n-grams found in the source transcript. */
  similarity: { gram8: number; gram15: number };
  outputPath: string;
  relativeOutputPath: string;
}

export type RemakeJobStatus = 'running' | 'done' | 'failed';

export interface RemakeJob {
  id: string;
  status: RemakeJobStatus;
  startedAt: string;
  finishedAt?: string;
  relativePath: string;
  language: PromptLanguage;
  /** Runtime the planner chose; set once the outline is accepted. */
  plannedMinutes?: number;
  lengthReason?: string;
  provider: LlmTextProvider;
  promptSetName?: string;
  profileName?: string;
  /** e.g. "chương 3/7" while running. */
  progress?: string;
  logs: { at: string; message: string }[];
  result?: RemakeResult;
  error?: string;
}

export interface StartRemakeInput {
  /** A downloaded transcript under the data dir. Give this or `transcript`. */
  relativePath?: string;
  /** Transcript text already in hand (e.g. several sources joined). */
  transcript?: string;
  /** Where to write the remake files; defaults to a `remake` folder next to the transcript file. */
  outputDir?: string;
  language: PromptLanguage;
  notes?: string;
  promptSetId?: string;
  provider?: LlmTextProvider;
}

/** VTT/SRT → one plain block of text: drops headers, cue numbers, timings, tags and [音楽]-style cues. */
export function transcriptToPlainText(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && line !== 'WEBVTT' && !line.includes('-->') && !/^\d+$/.test(line) && !/^(Kind|Language):/.test(line))
    .join('')
    .replace(/<[^>]+>/g, '')
    .replace(/\[[^\]]{1,10}\]/g, '');
}

/** Prefers the last code block (prompts ask for one), falls back to the plain reply. */
function responseBody(response: LlmBrowserResponse): string {
  const block = response.codeBlocks[response.codeBlocks.length - 1];
  return (block?.trim() ? block : response.content).trim();
}

function parseOutline(response: LlmBrowserResponse): RemakeOutline | null {
  for (const candidate of [...response.codeBlocks].reverse().concat(response.content)) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) continue;
    try {
      const parsed = outlineSchema.safeParse(JSON.parse(candidate.slice(start, end + 1)));
      if (parsed.success) return parsed.data;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

export function splitSentences(text: string): string[] {
  return text
    .split(/\r?\n/)
    .flatMap(line => line.split(/(?<=[。！？!?])/))
    .map(sentence => sentence.replace(/^[-・*\d.)\s]+/, '').trim())
    .filter(Boolean);
}

function remakeText(outline: RemakeOutline, chapters: RemakeChapter[]): string {
  const body = chapters
    .map((chapter, index) => `## ${index + 1}. ${chapter.heading}\n${chapter.sentences.join('\n')}`)
    .join('\n\n');
  return `${outline.title}\n\n切り口: ${outline.angle}\nフック: ${outline.hook}\n\n${body}\n`;
}

class ScriptRemakeService {
  private jobs = new Map<string, RemakeJob>();
  private activeJobId: string | null = null;

  async listPromptSets(language: PromptLanguage): Promise<PromptSet[]> {
    await ensureDefaultRemakePrompts();
    return promptsRepository
      .findAllSets()
      .filter(set => set.category === 'remake' && (set.language === language || set.language === 'all'))
      .filter(set => set.steps.some(step => step.step === 1) && set.steps.some(step => step.step === 2));
  }

  get(id: string): RemakeJob {
    const job = this.jobs.get(id);
    if (!job) throw new AppError('Không tìm thấy lượt remake', 404, 'NOT_FOUND');
    return job;
  }

  async start(input: StartRemakeInput): Promise<RemakeJob> {
    if (this.activeJobId) {
      throw new AppError('Đang có một lượt remake chạy — chờ xong rồi thử lại', 409, 'REMAKE_BUSY');
    }
    if (!input.relativePath && !input.transcript) {
      throw new AppError('Cần relativePath hoặc transcript', 400, 'VALIDATION_ERROR');
    }
    const transcript = input.transcript
      ? transcriptToPlainText(input.transcript)
      : transcriptToPlainText(await contentDownloadService.readTextArtifact(input.relativePath!));
    if (transcript.length < 200) {
      throw new AppError('Transcript quá ngắn để remake', 400, 'TRANSCRIPT_TOO_SHORT');
    }

    const sets = await this.listPromptSets(input.language);
    const set = input.promptSetId ? sets.find(item => item.id === input.promptSetId) : sets[0];
    if (!set) {
      throw new AppError(
        `Chưa có prompt "Remake kịch bản" (2 bước) cho ngôn ngữ ${input.language} — tạo ở trang Prompt`,
        404,
        'REMAKE_PROMPT_NOT_FOUND',
      );
    }

    await assertRemakeStep1Current(set.language, set.steps.find(item => item.step === 1)!.key);

    const job: RemakeJob = {
      id: generateId(),
      status: 'running',
      startedAt: new Date().toISOString(),
      relativePath: input.relativePath ?? '',
      language: input.language,
      provider: input.provider ?? promptsSettingsService.get().defaultLlmProvider,
      promptSetName: set.name,
      logs: [],
    };
    this.jobs.set(job.id, job);
    this.activeJobId = job.id;

    void this.run(job, set, transcript, input.notes?.trim() ?? '', input.outputDir)
      .catch(err => {
        job.status = 'failed';
        job.error = err instanceof Error ? err.message : String(err);
        this.log(job, `Lỗi: ${job.error}`);
      })
      .finally(() => {
        job.finishedAt = new Date().toISOString();
        job.progress = undefined;
        this.activeJobId = null;
      });

    return job;
  }

  private lengthProblems(outline: RemakeOutline): string[] {
    if (outline.targetMinutes === undefined) {
      return [`Thiếu targetMinutes (số nguyên ${VIDEO_MIN_MINUTES}–${VIDEO_MAX_MINUTES}).`];
    }
    return validateLength(outline.targetMinutes, outline.chapters.length);
  }

  private log(job: RemakeJob, message: string): void {
    job.logs.push({ at: new Date().toISOString(), message });
    if (job.logs.length > MAX_LOGS) job.logs.splice(0, job.logs.length - MAX_LOGS);
  }

  private async run(job: RemakeJob, set: PromptSet, transcript: string, notes: string, outputDirOverride?: string): Promise<void> {
    const stepKey = (step: number) => set.steps.find(item => item.step === step)!.key;
    const profile = chromeProfilesService.pickSubProfiles(1)[0]!;
    job.profileName = profile.name;
    const chat = (prompt: string) =>
      llmBrowserService.chat(profile.id, job.provider, prompt, undefined, {
        submitWith: 'enter',
        timeoutMs: RESPONSE_TIMEOUT_MS,
      });

    try {
      this.log(job, `Mở profile "${profile.name}" (${job.provider})`);
      // open() always lands on a fresh chat, so the whole remake lives in one conversation.
      await llmBrowserService.open(profile.id, job.provider);

      job.progress = 'dàn ý';
      this.log(job, `Gửi prompt bước 1 — lập dàn ý (${transcript.length} ký tự nguồn, LLM tự chọn ${VIDEO_MIN_MINUTES}–${VIDEO_MAX_MINUTES} phút)`);
      const outlinePrompt = await executePromptTemplate(set.language, stepKey(1), [
        transcript,
        notes,
        VIDEO_MIN_MINUTES,
        VIDEO_MAX_MINUTES,
      ]);
      let outline = parseOutline(await chat(outlinePrompt));
      if (!outline) {
        this.log(job, 'Dàn ý không đọc được JSON — nhờ LLM xuất lại');
        outline = parseOutline(
          await chat('先ほどの企画を、指定したJSON形式のコードブロック1つだけでもう一度出力してください。説明文は不要です。'),
        );
      }
      if (!outline) throw new AppError('LLM không trả về dàn ý JSON hợp lệ', 502, 'REMAKE_OUTLINE_INVALID');
      // The planner chooses the runtime, but the choice must be earned: inside the window, and a
      // chapter count that fits it. A rejected plan goes back to the same chat to be fixed.
      for (let attempt = 1; ; attempt++) {
        const problems = this.lengthProblems(outline);
        if (problems.length === 0) break;
        this.log(job, `Độ dài chưa đạt (${problems.join(' | ')})`);
        if (attempt > MAX_LENGTH_FIXES) {
          throw new AppError(`LLM không chọn được độ dài hợp lệ: ${problems.join(' ')}`, 502, 'REMAKE_LENGTH_INVALID');
        }
        const fixed = parseOutline(await chat(lengthFixPrompt(problems)));
        if (fixed) outline = fixed;
      }
      const plannedMinutes = outline.targetMinutes!;
      job.plannedMinutes = plannedMinutes;
      job.lengthReason = outline.lengthReason;
      this.log(job, `Dàn ý: "${outline.title}" — ${outline.chapters.length} chương, LLM chọn ${plannedMinutes} phút. Lý do: ${outline.lengthReason || '(không nêu)'}`);

      const chapterChars = Math.round((plannedMinutes * CHARS_PER_MIN) / outline.chapters.length);
      const chapters: RemakeChapter[] = [];
      for (const [index, chapter] of outline.chapters.entries()) {
        job.progress = `chương ${index + 1}/${outline.chapters.length}`;
        this.log(job, `Viết chương ${index + 1}/${outline.chapters.length}: ${chapter.heading}`);
        const prompt = await executePromptTemplate(set.language, stepKey(2), [
          index + 1,
          outline.chapters.length,
          chapter.heading,
          chapter.keyPoints,
          chapterChars,
        ]);
        const sentences = splitSentences(responseBody(await chat(prompt)));
        if (sentences.length === 0) throw new AppError(`Chương ${index + 1} trả về rỗng`, 502, 'REMAKE_CHAPTER_EMPTY');
        chapters.push({ heading: chapter.heading, sentences });
        this.log(job, `Xong chương ${index + 1}: ${sentences.join('').length} ký tự`);
      }

      const body = chapters.map(chapter => chapter.sentences.join('')).join('');
      const outputDir = outputDirOverride ?? path.join(path.dirname(path.resolve(paths.dataDir, job.relativePath)), 'remake');
      await fs.mkdir(outputDir, { recursive: true });
      const stamp = job.startedAt.replace(/[:.]/g, '-');
      const outputPath = path.join(outputDir, `remake-${stamp}.txt`);
      const result: RemakeResult = {
        outline,
        chapters,
        plannedMinutes,
        lengthReason: outline.lengthReason,
        totalChars: body.length,
        estimatedMinutes: Math.round((body.length / CHARS_PER_MIN) * 10) / 10,
        similarity: { gram8: ngramContainment(body, transcript, 8), gram15: ngramContainment(body, transcript, 15) },
        outputPath,
        relativeOutputPath: path.relative(paths.dataDir, outputPath).split(path.sep).join('/'),
      };
      await fs.writeFile(outputPath, remakeText(outline, chapters), 'utf8');
      await fs.writeFile(outputPath.replace(/\.txt$/, '.json'), JSON.stringify(result, null, 2), 'utf8');

      job.result = result;
      job.status = 'done';
      this.log(job, `Hoàn tất: ${result.totalChars} ký tự ≈ ${result.estimatedMinutes} phút → ${result.relativeOutputPath}`);
    } finally {
      await chromeProfilesService.closeSubProfiles([profile.id]).catch(() => undefined);
    }
  }
}

export const scriptRemakeService = new ScriptRemakeService();
