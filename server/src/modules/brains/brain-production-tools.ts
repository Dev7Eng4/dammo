import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { listVoicevoxSpeakers } from '../../infrastructure/tts/voicevox.client.js';
import { nichesRepository } from '../niches/niches.repository.js';
import { videoAgentRepository } from '../video-agent/video-agent.repository.js';
import { visualStylesRepository } from '../visual-styles/visual-styles.repository.js';
import { youtubeChannelVideosRepository } from '../youtube-channels/youtube-channel-videos.repository.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import type { YoutubeChannel } from '../youtube-channels/youtube-channels.types.js';
import type { BrainTool } from './brain-engine.js';
import { fetchChannelSnapshot, type TrendVideo } from './youtube-trends.js';

/**
 * Tools of the production / publishing / analytics brains: they read what the producer's own
 * pipeline has made (Agent tạo video runs, channel setup, stored channel videos). Read-only:
 * no brain starts a render or an upload.
 */

const UC_ID = /^UC[\w-]{22}$/;
const JST_OFFSET_MS = 9 * 3600 * 1000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function nicheName(id: string): string {
  return nichesRepository.findAll().find(n => n.key === id)?.label ?? id;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function requireChannel(id: string): YoutubeChannel {
  const channel = youtubeChannelsRepository.findById(id);
  if (!channel) throw new Error(`No own channel with id ${id}. Use list_my_channels for ids.`);
  return channel;
}

/** What the Agent tạo video pipeline has produced so far: scripts, narration pace, scene counts. */
export const listMyProductionsTool: BrainTool = {
  definition: {
    name: 'list_my_productions',
    description:
      "The producer's own videos made by the video pipeline (newest first): channel, title, status, stages done, " +
      'angle/hook and chapter headings of the script, planned vs real minutes, characters, VOICEVOX speaker + speed, ' +
      'measured narration pace (chars/min), scene count and seconds per scene, and whether the final video file exists.',
    input_schema: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Own channel id (from list_my_channels) to filter on.' },
        limit: { type: 'integer', minimum: 1, maximum: 40, description: 'Default 20.' },
      },
    },
  },
  run: async (raw, ctx) => {
    const input = z.object({ channelId: z.string().optional(), limit: z.number().int().optional() }).parse(raw);
    const runs = videoAgentRepository
      .findAll()
      .filter(run => !input.channelId || run.input.channelId === input.channelId)
      .slice(0, Math.min(input.limit ?? 20, 40));
    ctx.pulse('search', `Đọc ${runs.length} video mình đã sản xuất`);
    if (runs.length === 0) return 'No productions yet.';
    return runs
      .map(run => {
        const a = run.artifacts;
        const script = run.script;
        const secPerScene = a.audioDurationSec && a.sceneCount ? (a.audioDurationSec / a.sceneCount).toFixed(1) : '?';
        return [
          `run ${run.id} | ${run.createdAt.slice(0, 10)} | channel: ${run.channelName} (${run.input.channelId}) | ${run.mode ?? 'agent'} | status: ${run.status}`,
          `  title: ${run.title ?? script?.outline.title ?? '(no script yet)'}`,
          `  stages done: ${run.stagesDone.join(', ') || 'none'} | final video: ${a.videoPath ? 'yes' : 'no'}`,
          script
            ? `  script: ${script.totalChars} chars, planned ${script.plannedMinutes} min, review ${script.review ? (script.review.pass ? 'pass' : 'fail') : 'none'}\n` +
              `  angle: ${script.outline.angle}\n  hook: ${script.outline.hook}\n` +
              `  chapters: ${script.outline.chapters.map(c => `${c.heading} [${c.form}/${c.openingType}]`).join(' / ')}`
            : '',
          `  voice: speaker ${run.input.voicevoxSpeaker}, speed x${run.input.speedScale}` +
            (a.narrationFit
              ? `, real ${a.narrationFit.actualMinutes.toFixed(1)} min vs target ${a.narrationFit.targetMinutes} (${a.narrationFit.deviationPercent.toFixed(0)}% off), ${Math.round(a.narrationFit.charsPerMinute)} chars/min`
              : a.audioDurationSec
                ? `, audio ${(a.audioDurationSec / 60).toFixed(1)} min`
                : ', no audio yet'),
          `  scenes: ${a.sceneCount ?? 0} (${secPerScene} s/scene), images ${a.imagesGenerated ?? 0}, clips ${a.clipsGenerated ?? 0}, timing: ${a.sceneTimingBasis ?? '-'}`,
          run.error ? `  error: ${run.error.slice(0, 200)}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n');
  },
};

/** Production settings of the producer's own channels. */
export const myChannelSetupTool: BrainTool = {
  definition: {
    name: 'my_channel_setup',
    description:
      "Production and publishing setup of the producer's own channels: type, video type, visual style, scene density, caption style, " +
      'overlays, upload frequency and time slots (channel local time, JST for Japanese channels), last upload, subscribers, watch hours, monetization, notes.',
    input_schema: { type: 'object', properties: {} },
  },
  run: async (_raw, ctx) => {
    const channels = youtubeChannelsRepository.findAll().filter(c => c.status !== 'deleted');
    const styles = new Map(visualStylesRepository.findAll().map(s => [s.id, s.name]));
    ctx.pulse('search', `Đọc cấu hình ${channels.length} kênh của mình`);
    return (
      channels
        .map(c =>
          [
            `${c.id} | ${c.name} | ${c.handle} | niche: ${nicheName(c.niche)} | lang: ${c.language} | status: ${c.status} | type: ${c.type}`,
            `  video: ${c.reupAudioVideoType ?? '-'} | visual style: ${c.reupAudioVisualStyleId ? (styles.get(c.reupAudioVisualStyleId) ?? c.reupAudioVisualStyleId) : '-'} | background: ${c.reupAudioBackgroundImage ?? '-'}` +
              (c.aiSceneDensityMaxSec ? ` | max scene sec high/medium/low: ${c.aiSceneDensityMaxSec.high}/${c.aiSceneDensityMaxSec.medium}/${c.aiSceneDensityMaxSec.low}` : ''),
            `  captions: ${c.captionStyleKey ?? '-'} | audio bar: ${c.showAudioBar ? 'on' : 'off'} | subscribe overlay: ${c.showSubscribe ? 'on' : 'off'} | small video: ${c.showSmallVideo ? 'on' : 'off'} | mascot thumbnails: ${c.mascotThumbnailCandidates ?? 'off'}`,
            `  upload: ${c.uploadFrequency ?? '-'} at ${c.uploadSchedule?.join(', ') || '-'} | last upload: ${c.lastUploadAt ?? '-'}`,
            `  subscribers: ${c.subscribers ?? '?'} | watch hours (12m): ${c.watchHours ?? '?'} | monetization: ${c.monetizationStatus} | health: ${c.healthScore}` +
              (c.statsUpdatedAt ? ` | stats updated ${c.statsUpdatedAt.slice(0, 10)}` : ''),
            c.notes ? `  notes: ${c.notes.slice(0, 300)}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        )
        .join('\n') || 'No channels configured.'
    );
  },
};

export const listVoicesTool: BrainTool = {
  definition: {
    name: 'list_voices',
    description: 'VOICEVOX voices installed on this machine (speaker name, style name, style id) and the default speaker id. Only these can be used.',
    input_schema: { type: 'object', properties: {} },
  },
  run: async (_raw, ctx) => {
    try {
      const speakers = await listVoicevoxSpeakers();
      ctx.pulse('search', `VOICEVOX: ${speakers.length} giọng`);
      return [
        `Default speaker id: ${env.voicevoxSpeaker}`,
        ...speakers.map(s => `${s.name}: ${s.styles.map(style => `${style.name} (id ${style.id})`).join(', ')}`),
      ].join('\n');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.pulse('error', `VOICEVOX không phản hồi: ${message.slice(0, 200)}`);
      return `VOICEVOX is not reachable (${message.slice(0, 200)}). Default speaker id is ${env.voicevoxSpeaker}. Recommend from past productions only and say the voice list could not be read.`;
    }
  },
};

export const listVisualStylesTool: BrainTool = {
  definition: {
    name: 'list_visual_styles',
    description: 'Visual styles the scene-image generator can use (id, name, niche, language, the style rule text).',
    input_schema: { type: 'object', properties: {} },
  },
  run: async (_raw, ctx) => {
    const styles = visualStylesRepository.findAll();
    ctx.pulse('search', `Đọc ${styles.length} phong cách hình`);
    return (
      styles.map(s => `${s.id} | ${s.name} | niche: ${nicheName(s.niche)} | lang: ${s.language}\n  rule: ${s.rule.replace(/\s+/g, ' ').slice(0, 500)}`).join('\n') ||
      'No visual styles configured.'
    );
  },
};

/** YouTube keeps three auto-captured frames per video (about 25%, 50%, 75% in). */
export const viewVideoFramesTool: BrainTool = {
  definition: {
    name: 'view_video_frames',
    description:
      'Look inside videos: three frames YouTube captured from the middle of each video (about 25%, 50%, 75%), for up to 6 videos per call. ' +
      'Shows what the scenes look like (illustration, photo, stock footage, mascot), on-screen text and subtitles.',
    input_schema: {
      type: 'object',
      properties: { videoIds: { type: 'array', items: { type: 'string' }, maxItems: 6 } },
      required: ['videoIds'],
    },
  },
  run: async (raw, ctx) => {
    const { videoIds } = z.object({ videoIds: z.array(z.string().regex(/^[\w-]{11}$/)).min(1).max(6) }).parse(raw);
    const blocks: Anthropic.Beta.BetaToolResultBlockParam['content'] = [];
    for (const id of videoIds) {
      const v = ctx.seen.get(id);
      blocks.push({
        type: 'text',
        text: `${id} | ${v?.title ?? '?'} | ${v?.viewsPerHour ?? '?'} views/h | ${v?.durationSeconds ? `${Math.round(v.durationSeconds / 60)} min` : '?'} | ch: ${v?.channel ?? '?'}`,
      });
      for (const frame of [1, 2, 3]) {
        blocks.push({ type: 'image', source: { type: 'url', url: `https://i.ytimg.com/vi/${id}/hq${frame}.jpg` } });
      }
    }
    ctx.pulse('search', `Xem khung hình của ${videoIds.length} video`);
    return blocks;
  },
};

function jstParts(date: Date): { weekday: string; hour: number; day: string } {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return { weekday: WEEKDAYS[jst.getUTCDay()], hour: jst.getUTCHours(), day: jst.toISOString().slice(0, 10) };
}

/** When a video went up, as far as YouTube's relative age allows ("3 時間前" is exact to the hour, "5 日前" only to the day). */
function uploadTiming(v: TrendVideo, now: number): string {
  if (v.hoursAgo === null) return 'upload time unknown';
  const at = jstParts(new Date(now - v.hoursAgo * 3600 * 1000));
  if (v.hoursAgo < 24) return `uploaded ${at.day} ${at.weekday} ~${at.hour}:00 JST (hour precision)`;
  if (v.hoursAgo < 24 * 14) return `uploaded ${at.day} ${at.weekday} JST (day precision)`;
  return `uploaded around ${at.day} (rough)`;
}

export const uploadRhythmTool: BrainTool = {
  definition: {
    name: 'upload_rhythm',
    description:
      'When a YouTube channel (UC... id) uploads: each recent video with its estimated upload day/weekday/hour in JST and views/hour, ' +
      'plus the average gap between uploads. The hour is only known for videos under 24 hours old and the weekday for videos under 14 days old - the result says which.',
    input_schema: {
      type: 'object',
      properties: { channelId: { type: 'string' }, limit: { type: 'integer', minimum: 5, maximum: 30 } },
      required: ['channelId'],
    },
  },
  run: async (raw, ctx) => {
    const input = z.object({ channelId: z.string().regex(UC_ID), limit: z.number().int().optional() }).parse(raw);
    const snap = await fetchChannelSnapshot(input.channelId, input.limit ?? 20);
    const now = Date.now();
    for (const v of snap.videos) ctx.seen.set(v.videoId, v);
    ctx.seenChannels.set(snap.channelId, { name: snap.name, subscribers: snap.subscribers });
    const ages = snap.videos.map(v => v.hoursAgo).filter((h): h is number => h !== null && h < 24 * 30);
    const gapDays = ages.length > 1 ? (Math.max(...ages) - Math.min(...ages)) / 24 / (ages.length - 1) : null;
    const today = jstParts(new Date(now));
    ctx.pulse('search', `Nhịp đăng «${snap.name}»: ${snap.videos.length} video${gapDays !== null ? `, cách nhau ~${gapDays.toFixed(1)} ngày` : ''}`);
    return [
      `Channel ${snap.name} (${snap.channelId}) ${snap.subscribers}. Now: ${today.day} ${today.weekday} ${today.hour}:00 JST.` +
        (gapDays !== null ? ` Average gap in the last 30 days: ${gapDays.toFixed(1)} days (${ages.length} videos).` : ''),
      ...snap.videos.map(v => `${v.videoId} | ${v.title} | ${uploadTiming(v, now)} | ${v.views.toLocaleString('en')} views | ${v.viewsPerHour ?? '?'} views/h`),
    ].join('\n');
  },
};

/** Finished videos waiting to go out, next to each channel's slots. */
export const publishQueueTool: BrainTool = {
  definition: {
    name: 'publish_queue',
    description:
      "What is ready or nearly ready to publish on the producer's own channels: finished pipeline videos (final file exists), videos in progress, " +
      "and stored channel videos by status (Prepared / Created / Uploaded / Published / Error), with each channel's upload frequency, time slots and last upload.",
    input_schema: { type: 'object', properties: {} },
  },
  run: async (_raw, ctx) => {
    const runs = videoAgentRepository.findAll();
    const lines: string[] = [];
    let ready = 0;
    for (const channel of youtubeChannelsRepository.findAll()) {
      if (channel.status === 'deleted') continue;
      const mine = runs.filter(run => run.input.channelId === channel.id);
      const finished = mine.filter(run => run.artifacts.videoPath);
      const inProgress = mine.filter(run => !run.artifacts.videoPath && !['cancelled', 'failed'].includes(run.status));
      const stored = youtubeChannelVideosRepository.read(channel.id)?.videos ?? [];
      const byStatus = new Map<string, number>();
      for (const v of stored) byStatus.set(v.status ?? 'Published', (byStatus.get(v.status ?? 'Published') ?? 0) + 1);
      const waiting = stored.filter(v => v.status === 'Prepared' || v.status === 'Created');
      ready += finished.length + waiting.length;
      lines.push(
        `${channel.id} | ${channel.name} | status: ${channel.status} | upload: ${channel.uploadFrequency ?? '-'} at ${channel.uploadSchedule?.join(', ') || '-'} | last upload: ${channel.lastUploadAt ?? '-'}`,
        `  stored videos by status: ${[...byStatus].map(([s, n]) => `${s} ${n}`).join(', ') || 'none'}`,
        ...finished
          .slice(0, 10)
          .map(run => `  FINISHED run ${run.id} | ${run.title ?? '(untitled)'} | ${run.artifacts.audioDurationSec ? `${(run.artifacts.audioDurationSec / 60).toFixed(1)} min` : '?'} | made ${run.updatedAt.slice(0, 10)}`),
        ...inProgress
          .slice(0, 10)
          .map(run => `  IN PROGRESS run ${run.id} | ${run.title ?? '(no title yet)'} | status ${run.status} | done: ${run.stagesDone.join(', ') || 'none'}`),
        ...waiting.slice(0, 10).map(v => `  WAITING (${v.status}) ${v.id} | ${v.title}${v.missingTitleOrThumbnail ? ' | missing title or thumbnail' : ''}`),
      );
    }
    ctx.pulse('search', `Hàng chờ đăng: ${ready} video sẵn sàng`);
    return lines.join('\n') || 'No channels configured.';
  },
};

/** Public numbers of one own channel. Studio-only metrics (CTR, retention, revenue) are not available here. */
export const myChannelStatsTool: BrainTool = {
  definition: {
    name: 'my_channel_stats',
    description:
      "Performance of one of the producer's own channels from public data: latest uploads with views, age, views/hour and ratio vs the channel median " +
      '(live from YouTube when the channel has a UC id), plus the stored video list (views, likes, comments, publish date) from the last sync. ' +
      'CTR, retention and revenue exist only inside YouTube Studio and are NOT available - never state them.',
    input_schema: {
      type: 'object',
      properties: { channelId: { type: 'string', description: 'Own channel id from list_my_channels (not the UC id).' } },
      required: ['channelId'],
    },
  },
  run: async (raw, ctx) => {
    const { channelId } = z.object({ channelId: z.string().min(1) }).parse(raw);
    const channel = requireChannel(channelId);
    const lines = [
      `${channel.name} (${channel.handle}) | subscribers: ${channel.subscribers ?? '?'} | watch hours (12m, entered by hand): ${channel.watchHours ?? '?'} | monetization: ${channel.monetizationStatus}` +
        (channel.statsUpdatedAt ? ` | stats updated ${channel.statsUpdatedAt.slice(0, 10)}` : ''),
    ];
    let live = 0;
    if (channel.channelId && UC_ID.test(channel.channelId)) {
      try {
        const snap = await fetchChannelSnapshot(channel.channelId, 30);
        live = snap.videos.length;
        for (const v of snap.videos) ctx.seen.set(v.videoId, v);
        ctx.seenChannels.set(snap.channelId, { name: snap.name, subscribers: snap.subscribers });
        const base = median(snap.videos.map(v => v.viewsPerHour ?? 0).filter(Boolean));
        lines.push(`LIVE (${snap.subscribers}) median ${Math.round(base)} views/h:`);
        for (const v of snap.videos) {
          const ratio = base && v.viewsPerHour ? (v.viewsPerHour / base).toFixed(1) : '?';
          lines.push(
            `  ${v.videoId} | ${v.title} | ${v.views.toLocaleString('en')} views | ${v.published} | ${v.viewsPerHour ?? '?'} views/h | x${ratio} vs median | ${v.durationSeconds ? `${Math.round(v.durationSeconds / 60)} min` : '?'}`,
          );
        }
      } catch (err) {
        lines.push(`LIVE data unavailable: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`);
      }
    } else {
      lines.push('No UC channel id stored for this channel, so no live data.');
    }
    const store = youtubeChannelVideosRepository.read(channel.id);
    const published = (store?.videos ?? []).filter(v => !v.status || v.status === 'Published');
    if (store && published.length) {
      lines.push(`STORED (synced ${store.fetchedAt.slice(0, 10)}), ${published.length} published videos:`);
      for (const v of published.slice(0, 40)) {
        lines.push(
          `  ${v.id} | ${v.title} | ${v.viewCount ?? '?'} views | ${v.likeCount ?? '?'} likes | ${v.commentCount ?? '?'} comments | ${v.publishedAt?.slice(0, 10) ?? '?'} | ${v.duration ? `${Math.round(v.duration / 60)} min` : '?'}`,
        );
      }
    } else {
      lines.push('No stored video list for this channel.');
    }
    ctx.pulse('search', `Chỉ số kênh «${channel.name}»: ${live} video trực tiếp, ${published.length} video đã lưu`);
    return lines.join('\n');
  },
};
