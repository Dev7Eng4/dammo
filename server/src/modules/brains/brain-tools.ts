import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { nichesRepository } from '../niches/niches.repository.js';
import { sourceChannelsRepository } from '../source-channels/source-channels.repository.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import type { BrainTool } from './brain-engine.js';
import { BRAIN_DEFINITIONS } from './brains.registry.js';
import { brainsRepository } from './brains.repository.js';
import { NEURON_KINDS, type Neuron } from './brains.types.js';
import { fetchChannelSnapshot, fetchTopComments, searchYoutube, youtubeSuggestions, type TrendVideo } from './youtube-trends.js';

/** Niches are stored by id; show their names to the model. */
function nicheName(id: string): string {
  const niche = nichesRepository.findAll().find(n => n.key === id);
  return niche ? niche.label : id;
}

function formatVideo(v: TrendVideo): string {
  return (
    `${v.videoId} | ${v.title} | ch: ${v.channel}${v.channelId ? ` (${v.channelId})` : ''} | ${v.views.toLocaleString('en')} views | ` +
    `${v.published} | ${v.viewsPerHour ?? '?'} views/h | ${v.durationSeconds ? `${Math.round(v.durationSeconds / 60)} min` : '?'}`
  );
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const searchInput = z.object({
  query: z.string().min(1).max(200),
  upload_date: z.enum(['today', 'week', 'month', 'year', 'all']).optional(),
  prioritize: z.enum(['popularity', 'relevance']).optional(),
  limit: z.number().int().min(1).max(30).optional(),
});

export const youtubeSearchTool: BrainTool = {
  definition: {
    name: 'youtube_search',
    description:
      'Search Japanese YouTube (located in JP) for videos. Returns id, title, channel (+id), views, published, viewsPerHour (views per hour since upload) and duration. Free.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query, usually Japanese.' },
        upload_date: { type: 'string', enum: ['today', 'week', 'month', 'year', 'all'], description: 'Default week.' },
        prioritize: { type: 'string', enum: ['popularity', 'relevance'], description: 'Default popularity.' },
        limit: { type: 'integer', minimum: 1, maximum: 30, description: 'Default 15.' },
      },
      required: ['query'],
    },
  },
  run: async (raw, ctx) => {
    const input = searchInput.parse(raw);
    const videos = await searchYoutube(input.query, { uploadDate: input.upload_date, prioritize: input.prioritize, limit: input.limit });
    for (const video of videos) ctx.seen.set(video.videoId, video);
    const top = [...videos].sort((a, b) => (b.viewsPerHour ?? 0) - (a.viewsPerHour ?? 0))[0];
    ctx.pulse(
      'search',
      `YouTube «${input.query}» (${input.upload_date ?? 'week'}): ${videos.length} video` +
        (top ? ` — nóng nhất ${top.viewsPerHour ?? '?'} view/giờ: ${top.title}` : ''),
    );
    return videos.map(formatVideo).join('\n') || 'No videos found.';
  },
};

export const youtubeSuggestTool: BrainTool = {
  definition: {
    name: 'youtube_suggest',
    description: 'YouTube autocomplete suggestions (Japan) for a seed query: what viewers are typing now.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  run: async (raw, ctx) => {
    const { query } = z.object({ query: z.string().min(1).max(200) }).parse(raw);
    const suggestions = await youtubeSuggestions(query);
    ctx.pulse('search', `Gợi ý «${query}»: ${suggestions.slice(0, 6).join(' · ')}`);
    return suggestions.join('\n') || 'No suggestions.';
  },
};

export function webSearchTool(maxUses = 6): BrainTool {
  return {
    definition: {
      type: 'web_search_20260209',
      name: 'web_search',
      max_uses: maxUses,
      user_location: { type: 'approximate', country: 'JP', timezone: 'Asia/Tokyo' },
    },
  };
}

function describeNeuron(n: Neuron): string {
  const meta = n.meta
    ? Object.entries(n.meta)
        .filter(([, v]) => v !== '' && v !== 0 && !(Array.isArray(v) && v.length === 0))
        .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`)
        .join(' ')
    : '';
  return [
    `${n.kind}:${n.key.replace(/^[a-z]+:/, '')}`,
    n.label,
    n.labelJa && n.labelJa !== n.label ? `JA: ${n.labelJa}` : '',
    `heat ${n.heat}`,
    `seen ${n.hits}x, last ${n.lastSeenAt.slice(0, 10)}`,
    meta,
    n.links.length ? `links: ${n.links.slice(0, 8).join(', ')}` : '',
    n.detail ? `— ${n.detail.slice(0, 400)}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

/** Read what other brains have learned: this is how brains feed each other. */
export const readMemoryTool: BrainTool = {
  definition: {
    name: 'read_memory',
    description:
      'Read neurons (learned findings) of a brain, hottest and most recent first. Brains: ' +
      BRAIN_DEFINITIONS.filter(b => b.active)
        .map(b => `${b.id} (${b.name})`)
        .join(', ') +
      '. Video neurons read here count as seen, so you may save them too.',
    input_schema: {
      type: 'object',
      properties: {
        brainId: { type: 'string' },
        kind: { type: 'string', enum: [...NEURON_KINDS] },
        days: { type: 'integer', minimum: 1, maximum: 90, description: 'Only neurons seen in the last N days. Default 14.' },
        limit: { type: 'integer', minimum: 1, maximum: 80, description: 'Default 30.' },
      },
      required: ['brainId'],
    },
  },
  run: async (raw, ctx) => {
    const input = z
      .object({ brainId: z.string(), kind: z.string().optional(), days: z.number().int().optional(), limit: z.number().int().optional() })
      .parse(raw);
    const since = Date.now() - (input.days ?? 14) * 24 * 3600 * 1000;
    const neurons = brainsRepository
      .read()
      .neurons.filter(n => n.brainId === input.brainId && (!input.kind || n.kind === input.kind) && Date.parse(n.lastSeenAt) >= since)
      .sort((a, b) => b.heat * Math.min(3, b.hits) - a.heat * Math.min(3, a.hits) || b.lastSeenAt.localeCompare(a.lastSeenAt))
      .slice(0, Math.min(input.limit ?? 30, 80));
    for (const n of neurons) {
      if (n.kind !== 'video' || !n.url) continue;
      const id = n.key.replace(/^video:/, '');
      ctx.seen.set(id, {
        videoId: id,
        title: n.label,
        channel: String(n.meta?.channel ?? ''),
        channelId: n.meta?.channelId ? String(n.meta.channelId) : undefined,
        views: Number(n.meta?.views ?? 0),
        published: String(n.meta?.published ?? ''),
        hoursAgo: null,
        viewsPerHour: Number(n.meta?.viewsPerHour ?? 0),
        durationSeconds: n.meta?.minutes ? Number(n.meta.minutes) * 60 : null,
        url: n.url,
      });
    }
    const brainName = BRAIN_DEFINITIONS.find(b => b.id === input.brainId)?.name ?? input.brainId;
    ctx.pulse('search', `Đọc trí nhớ «${brainName}»${input.kind ? ` (${input.kind})` : ''}: ${neurons.length} nơ-ron`);
    return neurons.length ? neurons.map(describeNeuron).join('\n') : `Brain ${input.brainId} has no ${input.kind ? `${input.kind} ` : ''}neurons yet.`;
  },
};

/** Competitor channels: the producer's source channels in Japanese + channels behind hot videos found by the trend brain. */
export const listWatchlistTool: BrainTool = {
  definition: {
    name: 'list_watchlist',
    description:
      'Candidate competitor channels: Japanese source channels the producer follows, plus channels behind hot videos the trend brain found, with how often they appeared.',
    input_schema: { type: 'object', properties: {} },
  },
  run: async (_raw, ctx) => {
    const lines: string[] = [];
    for (const source of sourceChannelsRepository.findAll()) {
      if (source.platform !== 'youtube' || source.language !== 'ja') continue;
      lines.push(
        `source | ${source.channelId ?? '(no id)'} | ${source.name} | niche: ${nicheName(source.niche)} | ${source.subscriberCount ?? '?'} subs | ${source.fullUrl || source.url}`,
      );
    }
    const counts = new Map<string, { name: string; hits: number; vph: number }>();
    for (const n of brainsRepository.read().neurons) {
      if (n.kind !== 'video' || !n.meta?.channelId) continue;
      const id = String(n.meta.channelId);
      const entry = counts.get(id) ?? { name: String(n.meta.channel ?? ''), hits: 0, vph: 0 };
      entry.hits += 1;
      entry.vph = Math.max(entry.vph, Number(n.meta.viewsPerHour ?? 0));
      counts.set(id, entry);
    }
    for (const [id, c] of [...counts].sort((a, b) => b[1].hits - a[1].hits).slice(0, 30)) {
      lines.push(`trend | ${id} | ${c.name} | ${c.hits} hot videos | best ${c.vph} views/h`);
    }
    ctx.pulse('search', `Danh sách theo dõi: ${lines.length} kênh`);
    return lines.join('\n') || 'Watchlist empty. Use youtube_search to find channels in the niche (channel ids appear in results).';
  },
};

export const channelSnapshotTool: BrainTool = {
  definition: {
    name: 'channel_snapshot',
    description:
      'Latest uploads of one YouTube channel (by UC... id) with views, age and views/hour, plus the channel median views/hour so outliers (videos far above the channel\'s own baseline) stand out.',
    input_schema: {
      type: 'object',
      properties: { channelId: { type: 'string' }, limit: { type: 'integer', minimum: 5, maximum: 30 } },
      required: ['channelId'],
    },
  },
  run: async (raw, ctx) => {
    const input = z.object({ channelId: z.string().regex(/^UC[\w-]{22}$/), limit: z.number().int().optional() }).parse(raw);
    const snap = await fetchChannelSnapshot(input.channelId, input.limit ?? 20);
    for (const v of snap.videos) ctx.seen.set(v.videoId, v);
    ctx.seenChannels.set(snap.channelId, { name: snap.name, subscribers: snap.subscribers });
    const base = median(snap.videos.map(v => v.viewsPerHour ?? 0).filter(Boolean));
    const lines = snap.videos.map(v => {
      if (base && v.viewsPerHour) ctx.ratios?.set(v.videoId, v.viewsPerHour / base);
      const ratio = base && v.viewsPerHour ? (v.viewsPerHour / base).toFixed(1) : '?';
      return `${formatVideo(v)} | x${ratio} vs channel median`;
    });
    const best = [...snap.videos].sort((a, b) => (b.viewsPerHour ?? 0) - (a.viewsPerHour ?? 0))[0];
    ctx.pulse('search', `Kênh «${snap.name}» ${snap.subscribers}: ${snap.videos.length} video, median ${Math.round(base)} view/giờ${best ? `, đỉnh ${best.viewsPerHour}/giờ` : ''}`);
    return [`Channel ${snap.name} (${snap.channelId}) ${snap.subscribers}. Median views/h: ${Math.round(base)}`, ...lines].join('\n');
  },
};

export const videoCommentsTool: BrainTool = {
  definition: {
    name: 'video_comments',
    description: 'Top comments of a video (text, likes, reply count): what viewers feel, ask, argue about, and the exact words they use.',
    input_schema: {
      type: 'object',
      properties: { videoId: { type: 'string' }, limit: { type: 'integer', minimum: 5, maximum: 60 } },
      required: ['videoId'],
    },
  },
  run: async (raw, ctx) => {
    const input = z.object({ videoId: z.string().min(5), limit: z.number().int().optional() }).parse(raw);
    const comments = await fetchTopComments(input.videoId, input.limit ?? 40);
    const title = ctx.seen.get(input.videoId)?.title ?? input.videoId;
    ctx.pulse('search', `Đọc ${comments.length} bình luận: ${title}`);
    return comments.length
      ? comments.map(c => `[${c.likes} likes, ${c.replies} replies] ${c.text.replace(/\s+/g, ' ')}`).join('\n')
      : 'No comments (disabled or none yet).';
  },
};

export const listMyChannelsTool: BrainTool = {
  definition: {
    name: 'list_my_channels',
    description: "The producer's own YouTube channels (name, handle, niche, language, status) - the targets new videos are made for.",
    input_schema: { type: 'object', properties: {} },
  },
  run: async (_raw, ctx) => {
    const channels = youtubeChannelsRepository.findAll();
    ctx.pulse('search', `Đọc ${channels.length} kênh của mình`);
    return (
      channels
        .map(c => `${c.id} | ${c.name} | ${c.handle} | niche: ${nicheName(c.niche)} | lang: ${c.language} | status: ${c.status}`)
        .join('\n') || 'No channels configured.'
    );
  },
};

const thumbInput = z.object({ videoIds: z.array(z.string().min(5)).min(1).max(12) });

/** Shows thumbnails to the model (vision) next to each video's numbers. */
export const viewThumbnailsTool: BrainTool = {
  definition: {
    name: 'view_thumbnails',
    description: 'Look at the thumbnails of up to 12 videos (seen in this run or read from memory), each labelled with its id, title and views/hour.',
    input_schema: {
      type: 'object',
      properties: { videoIds: { type: 'array', items: { type: 'string' }, maxItems: 12 } },
      required: ['videoIds'],
    },
  },
  run: async (raw, ctx) => {
    const { videoIds } = thumbInput.parse(raw);
    const blocks: Anthropic.Beta.BetaToolResultBlockParam['content'] = [];
    for (const id of videoIds) {
      const v = ctx.seen.get(id);
      blocks.push({ type: 'text', text: `${id} | ${v?.title ?? '?'} | ${v?.viewsPerHour ?? '?'} views/h | ch: ${v?.channel ?? '?'}` });
      blocks.push({ type: 'image', source: { type: 'url', url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } });
    }
    ctx.pulse('search', `Xem ${videoIds.length} thumbnail`);
    return blocks;
  },
};
