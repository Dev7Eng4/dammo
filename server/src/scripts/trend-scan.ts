/**
 * CLI for the jp-psy-trends Claude Code skill: the same YouTube JP data and the same memory as the
 * jp-psy-trends brain, without the in-app AI loop.
 *
 *   npm run trends -- search [--date today|week|month|year|all] [--sort popularity|relevance] [--limit N] "q1" "q2" ...
 *   npm run trends -- suggest "seed1" "seed2" ...
 *   npm run trends -- channel [--limit N] UCxxxx [UCyyyy ...]
 *   npm run trends -- clusters                 # K1–K11 tagging rules (shared with the brain)
 *   npm run trends -- save findings.json       # store findings in the brain's memory → Radar page
 *
 * search/channel remember every video they print (data/trend-scan-cache.json). `save` only accepts
 * videos from that cache, like the brain only saves videos it fetched, so ids and numbers are never invented.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Log } from 'youtubei.js';
import { env } from '../config/env.js';
import { paths } from '../config/paths.js';
import { readJson, writeJson } from '../infrastructure/storage/json-store.js';
import type { SaveItem } from '../modules/brains/brain-engine.js';
import type { ImportFindingsInput } from '../modules/brains/brains.service.js';
import { TREND_BRAIN_ID } from '../modules/brains/brains.registry.js';
import { CLUSTER_RULES } from '../modules/brains/psy-clusters.js';
import { fetchChannelSnapshot, searchYoutube, youtubeSuggestions, type TrendVideo } from '../modules/brains/youtube-trends.js';

// youtubei.js prints a stack trace for every parser mismatch on new YouTube layouts; the data still parses.
Log.setLevel(Log.Level.NONE);

type UploadDate = 'today' | 'week' | 'month' | 'year' | 'all';
type Sort = 'popularity' | 'relevance';

const HOUR_MS = 3_600_000;
const CACHE_FILE = path.join(paths.dataDir, 'trend-scan-cache.json');
const CACHE_KEEP_HOURS = 72;

interface ScanCache {
  videos: Record<string, TrendVideo & { fetchedAt: string }>;
  channels: Record<string, { name: string; subscribers: string; fetchedAt: string }>;
  ratios: Record<string, number>;
}

function readCache(): ScanCache {
  const cache = readJson<ScanCache>(CACHE_FILE) ?? { videos: {}, channels: {}, ratios: {} };
  const cutoff = Date.now() - CACHE_KEEP_HOURS * HOUR_MS;
  for (const [id, video] of Object.entries(cache.videos)) {
    if (Date.parse(video.fetchedAt) < cutoff) {
      delete cache.videos[id];
      delete cache.ratios[id];
    }
  }
  for (const [id, channel] of Object.entries(cache.channels)) {
    if (Date.parse(channel.fetchedAt) < cutoff) delete cache.channels[id];
  }
  return cache;
}

function parseArgs(argv: string[]) {
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) flags[arg.slice(2)] = argv[(i += 1)] ?? '';
    else rest.push(arg);
  }
  return { flags, rest };
}

function line(v: TrendVideo, ratio?: string): string {
  const minutes = v.durationSeconds ? `${Math.round(v.durationSeconds / 60)}m` : '?m';
  return [
    `${v.viewsPerHour ?? '?'}/h`,
    ratio ? `x${ratio}` : '',
    `${v.views.toLocaleString('en')} views`,
    v.published || '?',
    minutes,
    v.videoId,
    v.title,
    `ch: ${v.channel}${v.channelId ? ` (${v.channelId})` : ''}`,
  ]
    .filter(Boolean)
    .join(' | ');
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function search(flags: Record<string, string>, queries: string[], cache: ScanCache) {
  const uploadDate = (flags.date ?? 'week') as UploadDate;
  const prioritize = (flags.sort ?? 'popularity') as Sort;
  const limit = Number(flags.limit ?? 15);
  for (const query of queries) {
    try {
      const videos = await searchYoutube(query, { uploadDate, prioritize, limit });
      videos.sort((a, b) => (b.viewsPerHour ?? 0) - (a.viewsPerHour ?? 0));
      const fetchedAt = new Date().toISOString();
      for (const v of videos) cache.videos[v.videoId] = { ...v, fetchedAt };
      console.log(`\n### search «${query}» (${uploadDate}, ${prioritize}) — ${videos.length} videos`);
      for (const v of videos) console.log(line(v));
    } catch (err) {
      console.log(`\n### search «${query}» — ERROR ${(err as Error).message}`);
    }
  }
}

async function channel(flags: Record<string, string>, ids: string[], cache: ScanCache) {
  for (const id of ids) {
    try {
      const snap = await fetchChannelSnapshot(id, Number(flags.limit ?? 20));
      const base = median(snap.videos.map(v => v.viewsPerHour ?? 0).filter(Boolean));
      const fetchedAt = new Date().toISOString();
      cache.channels[snap.channelId] = { name: snap.name, subscribers: snap.subscribers, fetchedAt };
      console.log(`\n### channel ${snap.name} (${snap.channelId}) ${snap.subscribers} — median ${Math.round(base)}/h`);
      for (const v of snap.videos) {
        cache.videos[v.videoId] = { ...v, fetchedAt };
        const ratio = base && v.viewsPerHour ? v.viewsPerHour / base : undefined;
        if (ratio !== undefined) cache.ratios[v.videoId] = ratio;
        console.log(line(v, ratio?.toFixed(1)));
      }
    } catch (err) {
      console.log(`\n### channel ${id} — ERROR ${(err as Error).message}`);
    }
  }
}

/** Builds the import payload from a findings file and the scan cache. */
function buildImport(file: string, cache: ScanCache): ImportFindingsInput {
  const findings = JSON.parse(fs.readFileSync(file, 'utf-8')) as { items: SaveItem[]; summary?: string };
  if (!Array.isArray(findings.items)) throw new Error(`${file}: expected { "items": [...], "summary"?: "..." }`);
  const now = Date.now();
  const videoIds = new Set(findings.items.filter(i => i.kind === 'video' && i.videoId).map(i => i.videoId as string));
  const missing = [...videoIds].filter(id => !cache.videos[id]);
  if (missing.length) {
    console.log(`⚠ ${missing.length} video không có trong cache (chưa search/channel trong ${CACHE_KEEP_HOURS} giờ qua), sẽ bị bỏ: ${missing.join(', ')}`);
  }
  const videos: TrendVideo[] = [...videoIds]
    .filter(id => cache.videos[id])
    .map(id => {
      const { fetchedAt, ...video } = cache.videos[id];
      // Age was measured at fetch time; move it to now so the saved publish time stays right.
      const drift = (now - Date.parse(fetchedAt)) / HOUR_MS;
      return { ...video, hoursAgo: video.hoursAgo === null ? null : video.hoursAgo + drift };
    });
  const channelIds = new Set(findings.items.filter(i => i.kind === 'channel').map(i => i.channelId ?? i.key ?? ''));
  return {
    items: findings.items,
    videos,
    channels: [...channelIds]
      .filter(id => cache.channels[id])
      .map(id => ({ channelId: id, name: cache.channels[id].name, subscribers: cache.channels[id].subscribers })),
    ratios: Object.fromEntries(videos.filter(v => cache.ratios[v.videoId] !== undefined).map(v => [v.videoId, cache.ratios[v.videoId]])),
    summary: findings.summary,
    source: 'skill Claude Code jp-psy-trends',
  };
}

interface ImportResult {
  runId: string;
  saved: Record<string, number>;
  skipped: string[];
}

/** Goes through the running server when there is one (it caches brains.json in memory); else writes directly. */
async function save(file: string, cache: ScanCache) {
  const payload = buildImport(file, cache);
  const url = `http://localhost:${env.port}/api/v1/brains/${TREND_BRAIN_ID}/import`;
  let result: ImportResult;
  let via: string;
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`Server trả ${response.status}: ${(await response.text()).slice(0, 500)}`);
    result = (await response.json()) as ImportResult;
    via = `server (${url})`;
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    if (cause !== 'ECONNREFUSED') throw err;
    const { brainsService } = await import('../modules/brains/brains.service.js');
    result = brainsService.importFindings(TREND_BRAIN_ID, payload);
    via = 'ghi thẳng vào data/brains.json (server không chạy)';
  }
  console.log(`Đã lưu vào bộ não ${TREND_BRAIN_ID} qua ${via}.`);
  console.log(`Ghi nhớ: ${Object.entries(result.saved).map(([k, c]) => `${c} ${k}`).join(', ') || '0'}`);
  if (result.skipped.length) console.log(`Bỏ ${result.skipped.length}:\n- ${result.skipped.join('\n- ')}`);
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  const { flags, rest } = parseArgs(argv);
  if (command === 'clusters') {
    console.log(CLUSTER_RULES);
    return;
  }
  if (!command || !rest.length) {
    console.error('Usage: trends search|suggest|channel|clusters|save <args...> (see file header)');
    process.exit(1);
  }

  const cache = readCache();
  if (command === 'search') await search(flags, rest, cache);
  else if (command === 'channel') await channel(flags, rest, cache);
  else if (command === 'suggest') {
    for (const seed of rest) {
      try {
        console.log(`\n### suggest «${seed}»\n${(await youtubeSuggestions(seed)).join('\n')}`);
      } catch (err) {
        console.log(`\n### suggest «${seed}» — ERROR ${(err as Error).message}`);
      }
    }
    return;
  } else if (command === 'save') {
    await save(rest[0], cache);
    return;
  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
  writeJson(CACHE_FILE, cache);
}

main().then(
  () => process.exit(0),
  err => {
    console.error(err);
    process.exit(1);
  },
);
