import fs from 'node:fs';
import { env } from '../../config/env.js';
import { listVoicevoxSpeakers } from '../../infrastructure/tts/voicevox.client.js';
import { requireYoutubeVideoId } from '../../infrastructure/youtube/youtube-url.js';
import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import { emptyUsage } from './claude.js';
import { emitVideoAgentEvent } from './video-agent.events.js';
import { toRunSummary, videoAgentRepository } from './video-agent.repository.js';
import { videoAgentRunner } from './video-agent.runner.js';
import type { CreateVideoAgentRunInput } from './video-agent.schema.js';
import type { VideoAgentRun, VideoAgentRunSummary } from './video-agent.types.js';

function requireRun(id: string): VideoAgentRun {
  const run = videoAgentRepository.findById(id);
  if (!run) throw new AppError('Không tìm thấy lượt chạy', 404, 'NOT_FOUND');
  return run;
}

function saveAndEmit(run: VideoAgentRun): VideoAgentRun {
  videoAgentRepository.save(run);
  emitVideoAgentEvent({ type: 'run_updated', run: toRunSummary(run) });
  return run;
}

/** Hands the producer's decision back to the agent as the result of its `request_approval` call. */
function answerApproval(id: string, approved: boolean, feedback: string | undefined): VideoAgentRun {
  const run = requireRun(id);
  if (run.status !== 'awaiting_approval' || !run.pendingApproval) {
    throw new AppError('Lượt chạy này không chờ duyệt', 409, 'NOT_AWAITING_APPROVAL');
  }
  const note = feedback?.trim();
  const content = approved
    ? `APPROVED by the producer.${note ? ` Feedback to apply first (then continue without asking again unless the change is large): ${note}` : ' Continue.'}`
    : `REJECTED by the producer. Feedback: ${note || '(none given)'}. Revise the script accordingly, then call request_approval again.`;

  const messages = videoAgentRepository.loadMessages(id);
  messages.push({
    role: 'user',
    content: [
      ...(run.heldToolResults ?? []),
      { type: 'tool_result', tool_use_id: run.pendingApproval.toolUseId, content },
    ],
  });
  videoAgentRepository.saveMessages(id, messages);

  if (approved && !run.stagesDone.includes('approval')) run.stagesDone.push('approval');
  run.steps.push({
    id: generateId(),
    at: new Date().toISOString(),
    kind: 'system',
    title: approved ? 'Producer đã duyệt kịch bản' : 'Producer yêu cầu sửa kịch bản',
    ...(note ? { detail: note } : {}),
  });
  run.pendingApproval = undefined;
  run.heldToolResults = undefined;
  run.status = 'queued';
  saveAndEmit(run);
  videoAgentRunner.enqueue(id);
  return run;
}

export const videoAgentService = {
  list(): VideoAgentRunSummary[] {
    return videoAgentRepository.findAll().map(toRunSummary);
  },

  get(id: string): VideoAgentRun {
    return requireRun(id);
  },

  create(input: CreateVideoAgentRunInput): VideoAgentRun {
    const channel = youtubeChannelsRepository.findById(input.channelId);
    if (!channel) throw new AppError('Không tìm thấy kênh đích', 404, 'NOT_FOUND');
    const sourceUrls = [...new Set(input.sourceUrls.map(url => url.trim()).filter(Boolean))];
    for (const url of sourceUrls) requireYoutubeVideoId(url);

    const now = new Date().toISOString();
    const run: VideoAgentRun = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      status: 'queued',
      input: {
        sourceUrls,
        channelId: channel.id,
        ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
        voicevoxSpeaker: input.voicevoxSpeaker ?? env.voicevoxSpeaker,
        speedScale: input.speedScale ?? 1,
        requireApproval: input.requireApproval ?? true,
      },
      channelName: channel.name,
      model: env.videoAgentModel,
      stagesDone: [],
      steps: [],
      usage: emptyUsage(),
      artifacts: { sources: [] },
      turns: 0,
    };
    saveAndEmit(run);
    videoAgentRunner.enqueue(run.id);
    return run;
  },

  approve(id: string, feedback?: string): VideoAgentRun {
    return answerApproval(id, true, feedback);
  },

  reject(id: string, feedback: string): VideoAgentRun {
    return answerApproval(id, false, feedback);
  },

  cancel(id: string): VideoAgentRun {
    const run = requireRun(id);
    if (videoAgentRunner.cancel(id)) return run; // the runner marks it cancelled when it unwinds
    if (run.status === 'completed' || run.status === 'cancelled') return run;
    run.status = 'cancelled';
    run.pendingApproval = undefined;
    run.currentStage = undefined;
    return saveAndEmit(run);
  },

  resume(id: string): VideoAgentRun {
    const run = requireRun(id);
    if (!['interrupted', 'failed', 'cancelled'].includes(run.status)) {
      throw new AppError('Chỉ tiếp tục được lượt đã dừng hoặc lỗi', 409, 'INVALID_STATUS');
    }
    // The agent sees its full history; a fresh turn budget lets it pick up where it stopped.
    run.turns = 0;
    run.status = 'queued';
    run.error = undefined;
    saveAndEmit(run);
    videoAgentRunner.enqueue(id);
    return run;
  },

  remove(id: string): void {
    if (videoAgentRunner.isActive(id)) {
      throw new AppError('Lượt đang chạy — huỷ trước khi xoá', 409, 'RUN_ACTIVE');
    }
    videoAgentRunner.cancel(id);
    if (!videoAgentRepository.remove(id)) throw new AppError('Không tìm thấy lượt chạy', 404, 'NOT_FOUND');
    emitVideoAgentEvent({ type: 'run_removed', runId: id });
  },

  videoFile(id: string): { filePath: string; size: number } {
    const filePath = requireRun(id).artifacts.videoPath;
    if (!filePath || !fs.existsSync(filePath)) throw new AppError('Chưa có video', 404, 'NOT_FOUND');
    return { filePath, size: fs.statSync(filePath).size };
  },

  async voicevoxStatus() {
    try {
      return { available: true, url: env.voicevoxUrl, defaultSpeaker: env.voicevoxSpeaker, speakers: await listVoicevoxSpeakers() };
    } catch (err) {
      return {
        available: false,
        url: env.voicevoxUrl,
        defaultSpeaker: env.voicevoxSpeaker,
        speakers: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  config() {
    return {
      model: env.videoAgentModel,
      apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
      maxTurns: env.videoAgentMaxTurns,
    };
  },
};
