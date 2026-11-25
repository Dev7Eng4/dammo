/**
 * Shared by the Claude Code brain skills (trend-scan.ts, brain-cli.ts): the cache of videos / channels
 * the skill has really fetched, and the import of a findings file into a brain's memory.
 *
 * A brain only saves videos and channels it fetched during its run; skills run across several CLI calls,
 * so what they fetch is kept in data/trend-scan-cache.json (72 hours) and `save` only accepts those.
 */
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env.js';
import { paths } from '../../config/paths.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { SaveItem } from '../../modules/brains/brain-engine.js';
import type { ImportFindingsInput } from '../../modules/brains/brains.service.js';
import type { TrendVideo } from '../../modules/brains/youtube-trends.js';

const HOUR_MS = 3_600_000;
export const CACHE_FILE = path.join(paths.dataDir, 'trend-scan-cache.json');
export const CACHE_KEEP_HOURS = 72;

export interface ScanCache {
  videos: Record<string, TrendVideo & { fetchedAt: string }>;
  channels: Record<string, { name: string; subscribers: string; fetchedAt: string }>;
  ratios: Record<string, number>;
}

export function readCache(): ScanCache {
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

export function writeCache(cache: ScanCache): void {
  writeJson(CACHE_FILE, cache);
}

/** Builds the import payload from a findings file and the scan cache. */
export function buildImport(file: string, cache: ScanCache, source: string): ImportFindingsInput {
  const findings = JSON.parse(fs.readFileSync(file, 'utf-8')) as { items: SaveItem[]; summary?: string };
  if (!Array.isArray(findings.items)) throw new Error(`${file}: expected { "items": [...], "summary"?: "..." }`);
  const now = Date.now();
  const videoIds = new Set(findings.items.filter(i => i.kind === 'video' && i.videoId).map(i => i.videoId as string));
  const missing = [...videoIds].filter(id => !cache.videos[id]);
  if (missing.length) {
    console.log(`⚠ ${missing.length} video không có trong cache (chưa lấy về trong ${CACHE_KEEP_HOURS} giờ qua), sẽ bị bỏ: ${missing.join(', ')}`);
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
    source,
  };
}

interface ImportResult {
  runId: string;
  saved: Record<string, number>;
  skipped: string[];
}

/** Goes through the running server when there is one (it caches brains.json in memory); else writes directly. */
export async function saveFindings(brainId: string, file: string, cache: ScanCache, source: string): Promise<void> {
  const payload = buildImport(file, cache, source);
  const url = `http://localhost:${env.port}/api/v1/brains/${brainId}/import`;
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
    const { brainsService } = await import('../../modules/brains/brains.service.js');
    result = brainsService.importFindings(brainId, payload);
    via = 'ghi thẳng vào data/brains.json (server không chạy)';
  }
  console.log(`Đã lưu vào bộ não ${brainId} qua ${via}.`);
  console.log(`Ghi nhớ: ${Object.entries(result.saved).map(([k, c]) => `${c} ${k}`).join(', ') || '0'}`);
  if (result.skipped.length) console.log(`Bỏ ${result.skipped.length}:\n- ${result.skipped.join('\n- ')}`);
}
