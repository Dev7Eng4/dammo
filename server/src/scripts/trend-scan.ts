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
import { Log } from 'youtubei.js';
import { TREND_BRAIN_ID } from '../modules/brains/brains.registry.js';
import { CLUSTER_RULES, SOURCE_TYPE_RULES } from '../modules/brains/psy-clusters.js';
import { fetchChannelSnapshot, searchYoutube, youtubeSuggestions, type TrendVideo } from '../modules/brains/youtube-trends.js';
import { readCache, saveFindings, writeCache, type ScanCache } from './lib/brain-skill-store.js';

// youtubei.js prints a stack trace for every parser mismatch on new YouTube layouts; the data still parses.
Log.setLevel(Log.Level.NONE);

type UploadDate = 'today' | 'week' | 'month' | 'year' | 'all';
type Sort = 'popularity' | 'relevance';

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

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  const { flags, rest } = parseArgs(argv);
  if (command === 'clusters') {
    console.log(`${CLUSTER_RULES}

${SOURCE_TYPE_RULES}`);
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
    await saveFindings(TREND_BRAIN_ID, rest[0], cache, 'skill Claude Code jp-psy-trends');
    return;
  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
  writeCache(cache);
}

main().then(
  () => process.exit(0),
  err => {
    console.error(err);
    process.exit(1);
  },
);
