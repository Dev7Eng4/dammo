import fs from 'node:fs';
import type Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { generateId } from '../../shared/id.js';
import { addUsage, describeClaudeError, FALLBACK_BETA, getClaudeClient } from './claude.js';
import { NARRATION_CHARS_PER_MIN } from './script-writer.js';
import { emitVideoAgentEvent } from './video-agent.events.js';
import { toRunSummary, videoAgentRepository, videoAgentRunDir } from './video-agent.repository.js';
import { executeVideoAgentTool, VIDEO_AGENT_TOOLS, type ToolContext } from './video-agent.tools.js';
import { VIDEO_MAX_MINUTES, VIDEO_MIN_MINUTES } from './video-agent.types.js';
import type { VideoAgentRun, VideoAgentStage, VideoAgentStep } from './video-agent.types.js';

const SYSTEM_PROMPT = `You are the producer agent of a Japanese YouTube channel network about psychology and brain science for viewers aged 50-70. You turn trending source videos into a NEW long-form video for one target channel, using the tools provided.

Workflow (tools enforce the order):
1. load_sources, then get_channel_profile.
2. Study the sources: what topic and promise made them spread, which points carry the video, what viewers of this age group worry about. First write down, for yourself, what ALL sources say (the consensus) - then decide where your video goes deeper or differently. Design the video around:
   - a central question the whole video answers (each chapter answers a part, the full answer lands at the end);
   - a recurring thread (an object, phrase or situation) that returns in every chapter with a slightly different meaning;
   - at least 3 original elements found in no source (a specific scene, a reframing, a practical step doable this week, an everyday Japanese anchor);
   - a title in the channel's style that is NOT the source title, and does not claim that science or research "proves" anything unless the script cites it;
   - a hook for the first 30 seconds, and 5-8 chapters. Give every chapter its own form (scene, reversal, dilemma, consultation, experiment, before_after), its own opening type, a small tension (a choice that costs something either way) and a concrete action scene. Adjacent chapters must differ in form and opening; the lesson must show through what someone does, not only through explanation.
   Avoid ideas, title formulas and chapter patterns already used on this channel (get_channel_profile lists earlier titles). If write_script rejects the outline, fix what it lists and call it again.
   Length rule - you choose the runtime (12-30 minutes) from the material, not from a wish for a round number and not from the length of the sources:
   - Count the distinct points that can each carry a chapter of their own (its own scene, tension and takeaway). A chapter holds about 1.5-4.5 minutes. Runtime ≈ chapters × 2-3 minutes.
   - Sources are evidence of what viewers want, not a length to match: a 10-minute source that is thin can be answered in 12 minutes of richer material, and a rich topic with several sources may justify 20-30 minutes.
   - More sources with genuinely different points, plus more original elements and conflicts, support a longer video. A topic with one idea and a few examples supports the 12-15 minute end.
   - Never stretch to reach a number. If you would have to repeat a point, restate an example or add generic advice to fill the time, the video is too long: shorten it. The minimum is 12 minutes, so if the topic cannot honestly fill it, pick a stronger angle with more material instead of padding.
   - Give the producer the reason in lengthReason (Vietnamese).
3. write_script with that outline and your chosen length (targetMinutes + lengthReason). Read the whole report and fix every FAIL before going on:
   - wording similarity FAIL, or a source marked FAIL for shared structure / reused examples → rewrite the affected chapters with your own order of points and your own examples (if most chapters follow one source, redesign the outline and call write_script again);
   - channel freshness FAIL (wording, title formula or chapter mould repeated from an earlier video of this channel, or an unsupported "science proves" title) → change the title or the chapter forms and call write_script again, or rewrite the overlapping chapters;
   - a chapter marked EXPLANATION, GENERIC or not following its form → revise it so a person does or says something in a concrete scene with particular details (age, amount, place, time, object);
   - an original element NOT written in or ALREADY IN A SOURCE → replace it with a different concrete element and revise the chapter that carries it;
   - thread missing or not shifting → revise the chapters where it is missing so it returns with a new meaning;
   - a repetition → revise the later chapter so it brings something new;
   - a WEAK hand-off chN→chN+1 → revise chapter N+1 so it opens from chapter N's ending (or chapter N so it leads into N+1), passing the editor's note as instructions;
   - arc DOES NOT BUILD → revise the chapters that stall, or redesign the outline;
   - length more than 15% off your planned length → revise the longest or shortest chapters (do not change the plan just to fit the text).
   Each revision is re-reviewed; stop after 3 revision rounds and tell the producer what is still open.
4. request_approval with a short Vietnamese summary for the producer (angle, chosen length and why, review result). If the producer rejects or gives feedback, apply it, then ask again.
5. synthesize_voice. If it reports OUT OF RANGE, adjust length with revise_chapter(keepApproval=true) as suggested and voice again (at most 2 rounds). Then generate_scene_images, assemble_video.
6. Finish with a short Vietnamese report: title, final length, what makes this video different from the sources, anything the producer should check before publishing (description, thumbnail, VOICEVOX credit).

Rules:
- Never copy sentences, examples or the structure of a source; ideas may be shared, expression must be yours.
- Do not invent studies, universities or statistics. No medical claims. Characters in examples are fictional, typical people; never present them as real, or as viewers who wrote in.
- Generic advice is the enemy: a paragraph that could sit in any video on the topic has to be replaced with a particular scene.
- If a tool fails, read the error and decide: retry once if it looks transient, otherwise stop and explain the blocker in Vietnamese. Do not loop on the same failing call.
- Keep your own messages short and in Vietnamese; the producer reads them in a timeline.`;

function initialMessage(run: VideoAgentRun): string {
  const { input } = run;
  return [
    `Target channel: ${run.channelName} (id ${input.channelId})`,
    `Source videos:\n${input.sourceUrls.map(url => `- ${url}`).join('\n')}`,
    `Length: you decide, between ${VIDEO_MIN_MINUTES} and ${VIDEO_MAX_MINUTES} minutes (about ${NARRATION_CHARS_PER_MIN} characters of narration per minute), from the material - see the length rule in your instructions.`,
    `Producer approval before voice: ${input.requireApproval ? 'required' : 'not required'}.`,
    input.notes ? `Producer notes: ${input.notes}` : '',
    'Make the video.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function isAbort(err: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (err instanceof Error && err.name === 'AbortError');
}

class VideoAgentRunner {
  private active: { runId: string; controller: AbortController } | null = null;
  private queue: string[] = [];

  /** Runs that were mid-flight when the server stopped cannot continue on their own. */
  recoverAfterRestart(): void {
    for (const run of videoAgentRepository.findAll()) {
      if (run.status === 'running' || run.status === 'queued') {
        this.save(run, current => {
          current.currentStage = undefined;
          if (current.mode === 'manual') {
            current.activeStages = [];
            // No loop to resume: the producer simply runs the step again.
            current.status = 'draft';
            current.error = 'Bước đang chạy bị ngắt do server khởi động lại — chạy lại bước đó.';
          } else {
            current.status = 'interrupted';
          }
        });
      }
    }
  }

  enqueue(runId: string): void {
    if (this.active?.runId === runId || this.queue.includes(runId)) return;
    this.queue.push(runId);
    void this.kick();
  }

  cancel(runId: string): boolean {
    this.queue = this.queue.filter(id => id !== runId);
    if (this.active?.runId === runId) {
      this.active.controller.abort();
      return true;
    }
    return false;
  }

  isActive(runId: string): boolean {
    return this.active?.runId === runId;
  }

  /** True while any agent run is working (it may be using the Chrome profiles and VOICEVOX). */
  isBusy(): boolean {
    return this.active !== null;
  }

  private async kick(): Promise<void> {
    if (this.active) return;
    const runId = this.queue.shift();
    if (!runId) return;
    const controller = new AbortController();
    this.active = { runId, controller };
    try {
      await this.process(runId, controller.signal);
    } catch (err) {
      console.error('[video-agent] run crashed', runId, err);
      this.save(videoAgentRepository.findById(runId), run => {
        run.status = 'failed';
        run.error = describeClaudeError(err);
      });
    } finally {
      this.active = null;
      void this.kick();
    }
  }

  private save(run: VideoAgentRun | null, mutate?: (run: VideoAgentRun) => void): void {
    if (!run) return;
    mutate?.(run);
    videoAgentRepository.save(run);
    emitVideoAgentEvent({ type: 'run_updated', run: toRunSummary(run) });
  }

  private appendStep(run: VideoAgentRun, step: Omit<VideoAgentStep, 'id' | 'at'>): void {
    const full: VideoAgentStep = { id: generateId(), at: new Date().toISOString(), ...step };
    run.steps.push(full);
    videoAgentRepository.save(run);
    emitVideoAgentEvent({ type: 'step_appended', runId: run.id, step: full });
  }

  private async process(runId: string, signal: AbortSignal): Promise<void> {
    const run = videoAgentRepository.findById(runId);
    if (!run || run.status === 'cancelled' || run.status === 'completed') return;

    const workDir = videoAgentRunDir(run.id);
    fs.mkdirSync(workDir, { recursive: true });
    const messages = videoAgentRepository.loadMessages(run.id);
    if (messages.length === 0) {
      messages.push({ role: 'user', content: initialMessage(run) });
      videoAgentRepository.saveMessages(run.id, messages);
    }

    this.save(run, current => {
      current.status = 'running';
      current.error = undefined;
    });

    const ctx: ToolContext = {
      run,
      workDir,
      usage: run.usage,
      signal,
      note: (title, detail) => this.appendStep(run, { kind: 'system', title: truncate(title, 300), detail }),
      markStage: (stage: VideoAgentStage) => {
        if (!run.stagesDone.includes(stage)) run.stagesDone.push(stage);
      },
    };

    try {
      while (run.turns < env.videoAgentMaxTurns) {
        signal.throwIfAborted();
        const response = await getClaudeClient().beta.messages.create(
          {
            model: run.model,
            max_tokens: 16000,
            betas: [FALLBACK_BETA],
            fallbacks: 'default',
            thinking: { type: 'adaptive', display: 'summarized' },
            output_config: { effort: 'medium' },
            // Auto-caches the growing conversation; system + tools never change within a run.
            cache_control: { type: 'ephemeral' },
            system: SYSTEM_PROMPT,
            tools: VIDEO_AGENT_TOOLS,
            messages,
          },
          { signal },
        );
        run.turns += 1;
        addUsage(run.usage, run.model, response.usage);

        for (const block of response.content) {
          if (block.type === 'thinking' && block.thinking.trim()) {
            this.appendStep(run, { kind: 'thinking', title: 'Suy nghĩ', detail: block.thinking });
          } else if (block.type === 'text' && block.text.trim()) {
            this.appendStep(run, { kind: 'message', title: truncate(block.text, 160), detail: block.text });
          }
        }

        if (response.stop_reason === 'refusal') {
          throw new Error(`Claude từ chối tiếp tục (category: ${response.stop_details?.category ?? 'không rõ'})`);
        }

        messages.push({ role: 'assistant', content: response.content });

        if (response.stop_reason === 'pause_turn') {
          videoAgentRepository.saveMessages(run.id, messages);
          continue;
        }

        const toolUses = response.content.filter(
          (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === 'tool_use',
        );

        if (toolUses.length === 0) {
          const text = response.content
            .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
            .map(block => block.text)
            .join('\n')
            .trim();
          videoAgentRepository.saveMessages(run.id, messages);
          this.save(run, current => {
            current.finalSummary = text;
            current.currentStage = undefined;
            if (current.artifacts.videoPath) {
              current.status = 'completed';
            } else {
              current.status = 'failed';
              current.error = text ? truncate(text, 500) : 'Agent dừng trước khi có video';
            }
          });
          return;
        }

        if (response.stop_reason === 'max_tokens') {
          throw new Error('Phản hồi của agent bị cắt (max_tokens) giữa lúc gọi tool');
        }

        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        let approvalRequest: { toolUseId: string; summary: string } | null = null;

        for (const toolUse of toolUses) {
          signal.throwIfAborted();
          this.appendStep(run, {
            kind: 'tool_call',
            toolName: toolUse.name,
            title: toolUse.name,
            detail: JSON.stringify(toolUse.input, null, 2),
          });
          this.save(run, current => {
            current.currentStage = VIDEO_AGENT_TOOLS_STAGE[toolUse.name] ?? current.currentStage;
          });

          const startedAt = Date.now();
          try {
            const outcome = await executeVideoAgentTool(toolUse.name, toolUse.input, ctx);
            if ('pause' in outcome) {
              approvalRequest = { toolUseId: toolUse.id, summary: outcome.summary };
              continue;
            }
            results.push({ type: 'tool_result', tool_use_id: toolUse.id, content: outcome.content });
            this.appendStep(run, {
              kind: 'tool_result',
              toolName: toolUse.name,
              title: truncate(outcome.content.split('\n')[0] ?? '', 200),
              detail: truncate(outcome.content, 20000),
              durationMs: Date.now() - startedAt,
            });
          } catch (err) {
            if (isAbort(err, signal)) throw err;
            const message = describeClaudeError(err);
            results.push({ type: 'tool_result', tool_use_id: toolUse.id, content: message, is_error: true });
            this.appendStep(run, {
              kind: 'tool_result',
              toolName: toolUse.name,
              title: truncate(message, 200),
              detail: err instanceof Error && err.stack ? truncate(err.stack, 4000) : undefined,
              durationMs: Date.now() - startedAt,
              isError: true,
            });
          }
          this.save(run);
        }

        if (approvalRequest) {
          videoAgentRepository.saveMessages(run.id, messages);
          this.save(run, current => {
            current.status = 'awaiting_approval';
            current.currentStage = 'approval';
            current.pendingApproval = { ...approvalRequest!, requestedAt: new Date().toISOString() };
            current.heldToolResults = results;
          });
          this.appendStep(run, { kind: 'system', title: 'Đang chờ duyệt kịch bản', detail: approvalRequest.summary });
          return;
        }

        messages.push({ role: 'user', content: results });
        videoAgentRepository.saveMessages(run.id, messages);
      }

      this.save(run, current => {
        current.status = 'failed';
        current.error = `Vượt quá ${env.videoAgentMaxTurns} lượt agent`;
      });
    } catch (err) {
      if (isAbort(err, signal)) {
        this.save(run, current => {
          current.status = 'cancelled';
          current.currentStage = undefined;
        });
        this.appendStep(run, { kind: 'system', title: 'Đã huỷ' });
        return;
      }
      const message = describeClaudeError(err);
      this.appendStep(run, { kind: 'error', title: truncate(message, 300) });
      this.save(run, current => {
        current.status = 'failed';
        current.error = message;
        current.currentStage = undefined;
      });
    }
  }
}

const VIDEO_AGENT_TOOLS_STAGE: Record<string, VideoAgentStage> = {
  load_sources: 'source',
  write_script: 'script',
  revise_chapter: 'script',
  request_approval: 'approval',
  synthesize_voice: 'voice',
  generate_scene_images: 'scenes',
  assemble_video: 'video',
};

export const videoAgentRunner = new VideoAgentRunner();
