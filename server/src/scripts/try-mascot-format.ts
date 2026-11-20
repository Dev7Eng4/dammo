/**
 * Thử format mascot mới trên BẢN SAO một video đã làm: chạy prompt meta của cụm rồi Thumbnail Director + vẽ.
 * Dữ liệu thật của video không bị ghi đè.
 *   pnpm tsx src/scripts/try-mascot-format.ts <channelId> <videoId> <outDir> [count]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { runMetadata } from '../modules/video-production/shared/meta/run-metadata.js';
import { describeClusterThumbnailPlan } from '../modules/video-production/shared/thumbnail/cluster-thumbnail-plan.js';
import { runMascotThumbnail } from '../modules/video-production/shared/thumbnail/run-mascot-thumbnail.js';
import { resolveChannelMascotImagePath } from '../modules/video-production/shared/ai-video/ai-video-channel-mascots.js';
import type { VideoMetaOutput } from '../modules/video-production/shared/meta/metadata.types.js';

const [channelId, videoId, outDirArg, countArg] = process.argv.slice(2);
if (!channelId || !videoId || !outDirArg) throw new Error('usage: <channelId> <videoId> <outDir> [count]');

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const srcDir = path.resolve('data/youtube-channels', channelId, 'videos', videoId);
const workDir = path.resolve(outDirArg);
await fs.mkdir(workDir, { recursive: true });
await fs.copyFile(path.join(srcDir, 'transcript.srt'), path.join(workDir, 'transcript.srt'));
const oldMeta = JSON.parse(await fs.readFile(path.join(srcDir, 'video-meta.json'), 'utf8')) as VideoMetaOutput & {
  source_title?: string;
};
await fs.copyFile(path.join(srcDir, 'thumbnail.jpg'), path.join(workDir, 'old-thumbnail.jpg')).catch(() => {});

const meta = await runMetadata(
  text(oldMeta.source_title) || text(oldMeta.metadata.title),
  path.join(workDir, 'transcript.srt'),
  'ja',
  videoId,
  { outputDir: workDir, niche: 'ja-psy-k1', imageStyle: 'soft clean warm illustration' },
);
console.log('\n=== METADATA ===');
console.log('old title :', oldMeta.metadata.title);
console.log('new title :', meta.metadata.title);
console.log('alt       :', (meta.alternative_titles ?? []).join(' / '));
console.log('format    :', JSON.stringify(meta.cluster_format));
console.log('hook_lines:', JSON.stringify((meta.thumbnail as Record<string, unknown> | undefined)?.hook_lines));

const mascotImagePath = await resolveChannelMascotImagePath(channelId);
if (!mascotImagePath) throw new Error('channel has no mascot image');
const formatBrief = describeClusterThumbnailPlan(meta);
const result = await runMascotThumbnail({
  workDir,
  language: 'ja',
  title: text(meta.metadata.title),
  context: [
    `Description: ${text(meta.metadata.description).slice(0, 1200)}`,
    `Other title ideas: ${(meta.alternative_titles ?? []).join(' / ')}`,
  ].join('\n'),
  niche: '',
  ...(formatBrief ? { formatBrief } : {}),
  count: Number(countArg) || 2,
  mascotImagePath,
  onLog: msg => console.log(msg),
});
console.log('\n=== THUMBNAIL ===');
for (const c of result.candidatesFile.candidates) {
  console.log(c.file ?? `FAILED: ${c.error}`, '|', c.angle, '|', JSON.stringify(c.hookLines));
}
console.log('saved:', result.thumbnailPath);
process.exit(0);
