import fs from 'node:fs';
import path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { paths } from '../../config/paths.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { VideoAgentRun, VideoAgentRunSummary } from './video-agent.types.js';

const RUN_FILE = 'run.json';
const MESSAGES_FILE = 'messages.json';

export function videoAgentRunDir(runId: string): string {
  return path.join(paths.videoAgentRunsDir, runId);
}

export function toRunSummary(run: VideoAgentRun): VideoAgentRunSummary {
  const { steps, script: _script, heldToolResults: _held, ...rest } = run;
  return { ...rest, stepCount: steps.length };
}

/** One folder per run: run state, the Claude conversation, and every produced file. */
class VideoAgentRepository {
  private cache = new Map<string, VideoAgentRun>();

  findAll(): VideoAgentRun[] {
    if (!fs.existsSync(paths.videoAgentRunsDir)) return [];
    const runs: VideoAgentRun[] = [];
    for (const id of fs.readdirSync(paths.videoAgentRunsDir)) {
      const run = this.findById(id);
      if (run) runs.push(run);
    }
    return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  findById(id: string): VideoAgentRun | null {
    const cached = this.cache.get(id);
    if (cached) return cached;
    const run = readJson<VideoAgentRun>(path.join(videoAgentRunDir(id), RUN_FILE));
    if (run) this.cache.set(id, run);
    return run;
  }

  save(run: VideoAgentRun): VideoAgentRun {
    run.updatedAt = new Date().toISOString();
    this.cache.set(run.id, run);
    writeJson(path.join(videoAgentRunDir(run.id), RUN_FILE), run);
    return run;
  }

  update(id: string, updater: (run: VideoAgentRun) => void): VideoAgentRun | null {
    const run = this.findById(id);
    if (!run) return null;
    updater(run);
    return this.save(run);
  }

  loadMessages(id: string): Anthropic.Beta.BetaMessageParam[] {
    return readJson<Anthropic.Beta.BetaMessageParam[]>(path.join(videoAgentRunDir(id), MESSAGES_FILE)) ?? [];
  }

  saveMessages(id: string, messages: Anthropic.Beta.BetaMessageParam[]): void {
    writeJson(path.join(videoAgentRunDir(id), MESSAGES_FILE), messages);
  }

  remove(id: string): boolean {
    this.cache.delete(id);
    const dir = videoAgentRunDir(id);
    if (!fs.existsSync(dir)) return false;
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  }
}

export const videoAgentRepository = new VideoAgentRepository();
