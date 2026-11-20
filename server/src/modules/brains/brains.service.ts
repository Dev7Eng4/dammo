import { addUsage, describeClaudeError, emptyUsage } from '../video-agent/claude.js';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import { emitBrainEvent } from './brains.events.js';
import { BRAIN_AGENTS } from './brain-agents.js';
import { buildFoundNeurons, runBrainAgent, type FoundNeuron, type SaveItem } from './brain-engine.js';
import { BRAIN_DEFINITIONS, findBrainDefinition, PIPELINE_ORDER } from './brains.registry.js';
import { brainsRepository } from './brains.repository.js';
import type { BrainView, Neuron, Pulse, PulseKind } from './brains.types.js';
import type { TrendVideo } from './youtube-trends.js';

/** Findings gathered outside the app (the jp-psy-trends Claude Code skill), with the raw data they rest on. */
export interface ImportFindingsInput {
  items: SaveItem[];
  /** Every video the items may reference, exactly as the YouTube helpers returned them. */
  videos: TrendVideo[];
  channels?: { channelId: string; name: string; subscribers: string }[];
  /** videoId → views/hour ÷ channel median views/hour. */
  ratios?: Record<string, number>;
  summary?: string;
  source?: string;
}

const DAY_MS = 24 * 3600 * 1000;

class BrainsService {
  private running = new Map<string, AbortController>();
  private pipeline: { controller: AbortController; current?: string } | null = null;

  list(): BrainView[] {
    const store = brainsRepository.read();
    return BRAIN_DEFINITIONS.map(def => ({
      ...def,
      ...store.brains[def.id],
      neuronCount: store.neurons.filter(n => n.brainId === def.id).length,
    }));
  }

  view(id: string): BrainView {
    const brain = this.list().find(b => b.id === id);
    if (!brain) throw new AppError('Không tìm thấy bộ não', 404, 'BRAIN_NOT_FOUND');
    return brain;
  }

  snapshot() {
    const store = brainsRepository.read();
    const since = Date.now() - DAY_MS;
    return {
      brains: this.list(),
      pipeline: this.pipelineStatus(),
      neurons: store.neurons,
      pulses: store.pulses.slice(-300),
      stats: {
        pulses24h: store.pulses.filter(p => Date.parse(p.at) >= since).length,
        errors24h: store.pulses.filter(p => p.kind === 'error' && Date.parse(p.at) >= since).length,
      },
    };
  }

  run(id: string, notes?: string): BrainView {
    void this.start(id, notes).catch(err => console.error('[brains] run failed', err));
    return this.view(id);
  }

  /** Starts a brain and resolves when its run ends (throws if it cannot start). */
  private start(id: string, notes?: string, outer?: AbortSignal): Promise<void> {
    const def = findBrainDefinition(id);
    if (!def) throw new AppError('Không tìm thấy bộ não', 404, 'BRAIN_NOT_FOUND');
    if (!def.active || !BRAIN_AGENTS[id]) throw new AppError('Bộ não này chưa được xây', 400, 'BRAIN_DORMANT');
    if (this.running.has(id)) throw new AppError('Bộ não đang chạy', 409, 'BRAIN_BUSY');

    const runId = generateId();
    const controller = new AbortController();
    outer?.addEventListener('abort', () => controller.abort(), { once: true });
    this.running.set(id, controller);
    this.patchState(id, state => {
      state.status = 'running';
      state.lastRunId = runId;
      state.lastError = undefined;
    });
    return this.execute(id, runId, controller, notes);
  }

  pipelineStatus() {
    return { running: Boolean(this.pipeline), current: this.pipeline?.current, order: PIPELINE_ORDER };
  }

  /** Runs every active brain in order, each reading what the previous ones just learned. */
  runPipeline(notes?: string) {
    if (this.pipeline) throw new AppError('Dây chuyền đang chạy', 409, 'PIPELINE_BUSY');
    const busy = PIPELINE_ORDER.filter(id => this.running.has(id));
    if (busy.length) throw new AppError(`Đang có não chạy: ${busy.join(', ')}`, 409, 'BRAIN_BUSY');
    const pipeline: { controller: AbortController; current?: string } = { controller: new AbortController() };
    this.pipeline = pipeline;
    void (async () => {
      try {
        for (const id of PIPELINE_ORDER) {
          if (pipeline.controller.signal.aborted) break;
          pipeline.current = id;
          emitBrainEvent({ type: 'pipeline', ...this.pipelineStatus() });
          await this.start(id, notes, pipeline.controller.signal);
          if (this.view(id).status === 'error') break;
        }
      } catch (err) {
        console.error('[brains] pipeline failed', err);
      } finally {
        this.pipeline = null;
        emitBrainEvent({ type: 'pipeline', ...this.pipelineStatus() });
      }
    })();
    emitBrainEvent({ type: 'pipeline', ...this.pipelineStatus() });
    return this.pipelineStatus();
  }

  cancelPipeline() {
    this.pipeline?.controller.abort();
    return this.pipelineStatus();
  }

  cancel(id: string): BrainView {
    this.running.get(id)?.abort();
    return this.view(id);
  }

  setAutoInterval(id: string, hours: number): BrainView {
    this.view(id);
    this.patchState(id, state => {
      state.autoIntervalHours = hours;
    });
    return this.view(id);
  }

  forget(id: string): BrainView {
    brainsRepository.update(store => {
      store.neurons = store.neurons.filter(n => n.brainId !== id);
    });
    emitBrainEvent({ type: 'neurons', brainId: id, neurons: [] });
    return this.view(id);
  }

  /**
   * Stores findings produced outside the app (the jp-psy-trends skill) as one run of this brain:
   * same validation and neuron shape as save_findings, so the Brains map and the Radar page show them.
   */
  importFindings(id: string, input: ImportFindingsInput) {
    const def = findBrainDefinition(id);
    const spec = BRAIN_AGENTS[id];
    if (!def || !spec) throw new AppError('Không tìm thấy bộ não', 404, 'BRAIN_NOT_FOUND');
    const evidence = {
      seen: new Map(input.videos.map(video => [video.videoId, video])),
      seenChannels: new Map((input.channels ?? []).map(c => [c.channelId, { name: c.name, subscribers: c.subscribers }])),
      ratios: new Map(Object.entries(input.ratios ?? {})),
    };
    const { neurons, skipped } = buildFoundNeurons(input.items, spec.kinds, evidence, {
      requireCluster: spec.requireCluster,
      source: 'skill',
    });
    const runId = generateId();
    const pulse = (kind: PulseKind, text: string) => this.pulse(id, runId, kind, text);
    pulse('start', `Nhận kết quả từ ${input.source ?? 'skill Claude Code'}`);
    if (neurons.length) this.saveNeurons(id, neurons);
    const counts: Record<string, number> = {};
    for (const n of neurons) counts[n.kind] = (counts[n.kind] ?? 0) + 1;
    const countText = Object.entries(counts).map(([k, c]) => `${c} ${k}`).join(', ') || '0';
    pulse('found', `Ghi nhớ ${countText}${skipped.length ? ` (bỏ ${skipped.length})` : ''}`);
    pulse('done', input.summary?.trim() || 'Xong lượt quét (skill)');
    this.patchState(id, state => {
      state.lastRunAt = new Date().toISOString();
      state.lastRunId = runId;
      state.runs += 1;
      if (state.status === 'error') {
        state.status = 'idle';
        state.lastError = undefined;
      }
    });
    return { runId, saved: counts, skipped };
  }

  /** Called by the scheduler: start brains whose interval elapsed. */
  tick(now = Date.now()): void {
    for (const brain of this.list()) {
      if (!brain.active || brain.autoIntervalHours <= 0 || this.running.has(brain.id)) continue;
      const last = brain.lastRunAt ? Date.parse(brain.lastRunAt) : 0;
      if (now - last >= brain.autoIntervalHours * 3600 * 1000) {
        try {
          this.run(brain.id);
        } catch (err) {
          console.error('[brains] auto run failed', err);
        }
      }
    }
  }

  /** Runs interrupted by a restart cannot continue. */
  recoverAfterRestart(): void {
    brainsRepository.update(store => {
      for (const state of Object.values(store.brains)) {
        if (state.status === 'running') {
          state.status = 'error';
          state.lastError = 'Bị ngắt do server khởi động lại';
        }
      }
    });
  }

  private async execute(id: string, runId: string, controller: AbortController, notes?: string): Promise<void> {
    const usage = emptyUsage();
    const pulse = (kind: PulseKind, text: string) => this.pulse(id, runId, kind, text);
    pulse('start', notes ? `Thức dậy — ghi chú: ${notes}` : 'Thức dậy');
    try {
      const summary = await runBrainAgent(BRAIN_AGENTS[id], {
        brainId: id,
        signal: controller.signal,
        notes,
        pulse,
        save: neurons => this.saveNeurons(id, neurons),
        usage: u => addUsage(usage, env.videoAgentModel, u),
        seen: new Map(),
        seenChannels: new Map(),
        ratios: new Map(),
      });
      pulse('done', summary || 'Xong lượt quét');
      this.finish(id, usage, 'idle');
    } catch (err) {
      const message = controller.signal.aborted ? 'Đã dừng theo yêu cầu' : describeClaudeError(err);
      pulse('error', message);
      this.finish(id, usage, controller.signal.aborted ? 'idle' : 'error', controller.signal.aborted ? undefined : message);
    } finally {
      this.running.delete(id);
    }
  }

  private finish(id: string, usage: ReturnType<typeof emptyUsage>, status: 'idle' | 'error', error?: string): void {
    this.patchState(id, state => {
      state.status = status;
      state.lastError = error;
      state.lastRunAt = new Date().toISOString();
      state.runs += 1;
      state.usage.calls += usage.calls;
      state.usage.inputTokens += usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
      state.usage.outputTokens += usage.outputTokens;
      state.usage.costUsd += usage.costUsd;
    });
  }

  private saveNeurons(brainId: string, found: FoundNeuron[]): void {
    const now = new Date().toISOString();
    const touched: Neuron[] = [];
    brainsRepository.update(store => {
      for (const item of found) {
        const existing = store.neurons.find(n => n.brainId === brainId && n.key === item.key);
        if (existing) {
          Object.assign(existing, {
            ...item,
            links: [...new Set([...existing.links, ...item.links])],
            hits: existing.hits + 1,
            lastSeenAt: now,
          });
          touched.push(existing);
        } else {
          const neuron: Neuron = { ...item, id: generateId(), brainId, hits: 1, firstSeenAt: now, lastSeenAt: now };
          store.neurons.push(neuron);
          touched.push(neuron);
        }
      }
    });
    emitBrainEvent({ type: 'neurons', brainId, neurons: touched });
  }

  private pulse(brainId: string, runId: string, kind: PulseKind, text: string): void {
    const pulse: Pulse = { id: generateId(), brainId, runId, at: new Date().toISOString(), kind, text: text.slice(0, 4000) };
    brainsRepository.update(store => {
      store.pulses.push(pulse);
    });
    emitBrainEvent({ type: 'pulse', pulse });
  }

  private patchState(id: string, mutate: (state: BrainView) => void): void {
    brainsRepository.update(store => {
      mutate(store.brains[id] as BrainView);
    });
    emitBrainEvent({ type: 'brain_updated', brain: this.view(id) });
  }
}

export const brainsService = new BrainsService();

let timer: NodeJS.Timeout | null = null;

export function startBrainsScheduler(): void {
  brainsService.recoverAfterRestart();
  if (timer) return;
  timer = setInterval(() => brainsService.tick(), 5 * 60 * 1000);
  timer.unref();
}

export function stopBrainsScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
