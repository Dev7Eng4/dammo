import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { FALLBACK_BETA, getClaudeClient } from '../video-agent/claude.js';
import type { Neuron, NeuronKind, PulseKind } from './brains.types.js';
import { OFF_NICHE, parseClusterTag, parseSourceType, SOURCE_TYPES } from './psy-clusters.js';
import { type TrendVideo } from './youtube-trends.js';

export type FoundNeuron = Omit<Neuron, 'id' | 'brainId' | 'hits' | 'firstSeenAt' | 'lastSeenAt'>;

export interface BrainContext {
  brainId: string;
  signal: AbortSignal;
  notes?: string;
  pulse: (kind: PulseKind, text: string) => void;
  save: (neurons: FoundNeuron[]) => void;
  usage: (usage: Anthropic.Beta.BetaUsage) => void;
  /** Videos this run has looked at; save_findings only accepts these, so ids are never invented. */
  seen: Map<string, TrendVideo>;
  /** Channels this run has looked at (id → name/subscribers). */
  seenChannels: Map<string, { name: string; subscribers: string }>;
  /** videoId → views/hour ÷ its channel's median views/hour, filled by channel_snapshot. */
  ratios?: Map<string, number>;
}

/** What a set of findings is checked against: only videos/channels actually fetched can be saved. */
export type FindingsEvidence = Pick<BrainContext, 'seen' | 'seenChannels' | 'ratios'>;

export type ToolResult = string | Anthropic.Beta.BetaToolResultBlockParam['content'];

export interface BrainTool {
  definition: Anthropic.Beta.BetaToolUnion;
  /** Absent for server tools (web search), which Anthropic runs. */
  run?: (input: unknown, ctx: BrainContext) => Promise<ToolResult>;
}

export interface BrainAgentSpec {
  system: string;
  tools: BrainTool[];
  /** Kinds this brain may store. */
  kinds: NeuronKind[];
  /** Every saved video must carry a K1–K11 cluster (or "off"). */
  requireCluster?: boolean;
  kickoff: (ctx: BrainContext) => string;
  maxTurns?: number;
}

export function neuronKey(kind: NeuronKind, key: string): string {
  const clean = key.trim().replace(new RegExp(`^${kind}:`), '');
  return `${kind}:${kind === 'video' || kind === 'channel' ? clean : clean.toLowerCase().replace(/\s+/g, '-')}`;
}

const saveItem = z.object({
  kind: z.string(),
  key: z.string().max(120).optional(),
  label: z.string().min(1).max(300),
  labelJa: z.string().max(300).optional(),
  detail: z.string().max(3000).default(''),
  heat: z.number().min(0).max(100),
  videoId: z.string().optional(),
  channelId: z.string().optional(),
  links: z.array(z.string().max(160)).max(30).optional(),
  cluster: z.string().max(12).optional(),
  subCluster: z.string().max(12).optional(),
  format: z.string().max(80).optional(),
  sourceType: z.string().max(20).optional(),
});
export const saveInput = z.object({ items: z.array(saveItem).max(120) });
export type SaveItem = z.infer<typeof saveItem>;

const HOUR_MS = 3_600_000;

/** Cluster fields shared by every neuron kind; also reports a bad tag so the agent can fix it. */
function clusterMeta(item: SaveItem): { meta: Record<string, string | number>; error?: string } {
  const meta: Record<string, string | number> = {};
  if (item.format?.trim()) meta.format = item.format.trim();
  if (item.sourceType?.trim()) {
    const type = parseSourceType(item.sourceType);
    if (!type) return { meta, error: `sourceType "${item.sourceType}" is not one of ${SOURCE_TYPES.map(t => t.id).join(', ')}` };
    meta.sourceType = type;
  }
  if (!item.cluster) return { meta };
  const main = parseClusterTag(item.cluster);
  if (!main) return { meta, error: `cluster "${item.cluster}" is not K1–K11 or "off"` };
  meta.cluster = main.id;
  if (main.unsure) meta.clusterUnsure = 1;
  const sub = parseClusterTag(item.subCluster);
  if (sub && sub.id !== OFF_NICHE && sub.id !== main.id) meta.subCluster = sub.id;
  return { meta };
}

/**
 * Turns save_findings items into neurons. Shared by the brain's tool and by imports from the
 * jp-psy-trends skill, so both store exactly the same shape and obey the same "no invented ids" rule.
 */
export function buildFoundNeurons(
  items: SaveItem[],
  kinds: NeuronKind[],
  evidence: FindingsEvidence,
  options: { requireCluster?: boolean; source: 'brain' | 'skill'; now?: number },
): { neurons: FoundNeuron[]; skipped: string[] } {
  const now = options.now ?? Date.now();
  const neurons: FoundNeuron[] = [];
  const skipped: string[] = [];
  for (const item of items) {
    const kind = item.kind as NeuronKind;
    if (!kinds.includes(kind)) {
      skipped.push(`${item.label} (kind ${item.kind} not allowed)`);
      continue;
    }
    const links = (item.links ?? []).map(link => link.trim()).filter(Boolean);
    const cluster = clusterMeta(item);
    if (cluster.error) {
      skipped.push(`${item.videoId ?? item.label} (${cluster.error})`);
      continue;
    }
    if (kind === 'video') {
      const info = item.videoId ? evidence.seen.get(item.videoId) : undefined;
      if (!info) {
        skipped.push(`video ${item.videoId ?? '?'} (not seen in this run)`);
        continue;
      }
      if (options.requireCluster && !cluster.meta.cluster) {
        skipped.push(`video ${info.videoId} (needs cluster K1–K11 or "off")`);
        continue;
      }
      const ratio = evidence.ratios?.get(info.videoId);
      neurons.push({
        kind,
        key: neuronKey('video', info.videoId),
        label: info.title,
        labelJa: info.title,
        detail: item.detail,
        heat: item.heat,
        url: info.url,
        meta: {
          channel: info.channel,
          channelId: info.channelId ?? '',
          views: info.views,
          viewsPerHour: info.viewsPerHour ?? 0,
          published: info.published,
          // Search results only give "3 日前"; pin it to a timestamp so age stays right later.
          publishedAt: info.hoursAgo !== null ? new Date(now - info.hoursAgo * HOUR_MS).toISOString() : '',
          minutes: info.durationSeconds ? Math.round(info.durationSeconds / 60) : 0,
          ...(ratio !== undefined ? { channelRatio: Math.round(ratio * 10) / 10 } : {}),
          ...cluster.meta,
          source: options.source,
        },
        links,
      });
      continue;
    }
    if (kind === 'channel') {
      const id = item.channelId ?? item.key;
      if (!id || !/^UC[\w-]{22}$/.test(id)) {
        skipped.push(`channel ${item.label} (needs a UC... channelId)`);
        continue;
      }
      const known = evidence.seenChannels.get(id);
      neurons.push({
        kind,
        key: neuronKey('channel', id),
        label: known?.name ?? item.label,
        labelJa: item.labelJa,
        detail: item.detail,
        heat: item.heat,
        url: `https://www.youtube.com/channel/${id}`,
        meta: { subscribers: known?.subscribers ?? '', ...cluster.meta, source: options.source },
        links,
      });
      continue;
    }
    const key = item.key?.trim() || item.labelJa?.trim() || item.label;
    neurons.push({
      kind,
      key: neuronKey(kind, key),
      label: item.label,
      labelJa: item.labelJa,
      detail: item.detail,
      heat: item.heat,
      url: kind === 'keyword' && item.labelJa ? `https://www.youtube.com/results?search_query=${encodeURIComponent(item.labelJa)}` : undefined,
      meta: { ...cluster.meta, source: options.source },
      links,
    });
  }
  return { neurons, skipped };
}

/** The one tool every brain uses to write into its memory. */
export function saveFindingsTool(kinds: NeuronKind[], requireCluster = false): BrainTool {
  return {
    definition: {
      name: 'save_findings',
      description:
        'Store findings in this brain\'s memory as neurons. Reuse the same key for the same thing across runs (it then strengthens). ' +
        'Use links to connect a neuron to others, as "<kind>:<key>" (e.g. "topic:fufu-kyori", "video:dQw4w9WgXcQ") - also neurons of other brains read via read_memory.',
      input_schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: kinds },
                key: { type: 'string', description: 'Short stable slug (romaji/english). Not needed for video/channel (their id is the key).' },
                label: { type: 'string', description: 'Vietnamese label (for video: leave the original title).' },
                labelJa: { type: 'string', description: 'Japanese wording, when it matters.' },
                detail: { type: 'string', description: 'Vietnamese explanation with evidence (numbers, video ids, quotes).' },
                heat: { type: 'number', minimum: 0, maximum: 100, description: 'How strong / urgent / promising, 0-100.' },
                videoId: { type: 'string', description: 'Required for kind video. Must come from a tool result in this run.' },
                channelId: { type: 'string', description: 'Required for kind channel (UC...).' },
                links: { type: 'array', items: { type: 'string' } },
                cluster: { type: 'string', description: 'Main cluster K1–K11 ("K2?" when unsure, "off" outside the niche).' },
                subCluster: { type: 'string', description: 'Optional second cluster K1–K11.' },
                format: { type: 'string', description: 'Video format, e.g. 寝ながら聴く 1h, 実は〇〇です, 漫画, 名言朗読, 脳トレ.' },
                sourceType: { type: 'string', enum: SOURCE_TYPES.map(t => t.id), description: 'Kind of production (see the source type rules): decides whether our channels can remake it or only borrow the topic.' },
              },
              required: ['kind', 'label', 'heat'],
            },
          },
        },
        required: ['items'],
      },
    },
    run: async (raw, ctx) => {
      const { items } = saveInput.parse(raw);
      const { neurons, skipped } = buildFoundNeurons(items, kinds, ctx, { requireCluster, source: 'brain' });
      if (neurons.length) ctx.save(neurons);
      const counts = new Map<string, number>();
      for (const n of neurons) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
      ctx.pulse('found', `Ghi nhớ ${[...counts].map(([k, c]) => `${c} ${k}`).join(', ') || '0'}${skipped.length ? ` (bỏ ${skipped.length})` : ''}`);
      return skipped.length ? `Saved ${neurons.length}. Skipped: ${skipped.join('; ')}` : `Saved ${neurons.length}.`;
    },
  };
}

export async function runBrainAgent(spec: BrainAgentSpec, ctx: BrainContext): Promise<string> {
  const tools = [...spec.tools, saveFindingsTool(spec.kinds, spec.requireCluster)];
  const byName = new Map(tools.map(tool => [(tool.definition as { name: string }).name, tool]));
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: 'user',
      content: [
        `Today is ${new Date().toISOString().slice(0, 10)}.`,
        spec.kickoff(ctx),
        ctx.notes ? `Producer notes for this run: ${ctx.notes}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
  let summary = '';

  for (let turn = 0; turn < (spec.maxTurns ?? 24); turn += 1) {
    if (ctx.signal.aborted) throw new Error('Đã dừng');
    const response = await getClaudeClient().beta.messages.create(
      {
        model: env.videoAgentModel,
        max_tokens: 16000,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        thinking: { type: 'adaptive', display: 'summarized' },
        output_config: { effort: 'medium' },
        cache_control: { type: 'ephemeral' },
        system: spec.system,
        tools: tools.map(tool => tool.definition),
        messages,
      },
      { signal: ctx.signal },
    );
    ctx.usage(response.usage);
    if (response.stop_reason === 'refusal') throw new Error('Claude từ chối yêu cầu');

    const toolUses: Anthropic.Beta.BetaToolUseBlock[] = [];
    for (const block of response.content) {
      if (block.type === 'thinking' && block.thinking.trim()) ctx.pulse('think', block.thinking.trim());
      else if (block.type === 'text' && block.text.trim()) {
        summary = block.text.trim();
        ctx.pulse('think', summary);
      } else if (block.type === 'server_tool_use' && block.name === 'web_search') {
        ctx.pulse('search', `Web: ${(block.input as { query?: string }).query ?? ''}`);
      } else if (block.type === 'tool_use') toolUses.push(block);
    }
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'pause_turn') continue;
    if (toolUses.length === 0) break;

    const results = await Promise.all(
      toolUses.map(async (use): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        const tool = byName.get(use.name);
        try {
          if (!tool?.run) throw new Error(`Unknown tool ${use.name}`);
          return { type: 'tool_result', tool_use_id: use.id, content: await tool.run(use.input, ctx) };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          ctx.pulse('error', `${use.name}: ${message.slice(0, 300)}`);
          return { type: 'tool_result', tool_use_id: use.id, content: `Error: ${message.slice(0, 1000)}`, is_error: true };
        }
      }),
    );
    messages.push({ role: 'user', content: results });
  }
  return summary;
}
