/**
 * Thử prompt meta của một cụm + Thumbnail Director trên một transcript bất kỳ (không cần video trong kênh).
 *   pnpm tsx src/scripts/try-cluster-format.ts <niche> <transcript.srt> <sourceTitle> <outDir> <mascotImage> [count]
 * Ví dụ niche: ja-psy-k5. Không ghi vào dữ liệu kênh nào.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { runMetadata } from '../modules/video-production/shared/meta/run-metadata.js';
import { describeClusterThumbnailPlan } from '../modules/video-production/shared/thumbnail/cluster-thumbnail-plan.js';
import { runMascotThumbnail } from '../modules/video-production/shared/thumbnail/run-mascot-thumbnail.js';

const [niche, srtArg, sourceTitle, outDirArg, mascotArg, countArg] = process.argv.slice(2);
if (!niche || !srtArg || !sourceTitle || !outDirArg || !mascotArg) {
  throw new Error('usage: <niche> <transcript.srt> <sourceTitle> <outDir> <mascotImage> [count]');
}
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const workDir = path.resolve(outDirArg);
await fs.mkdir(workDir, { recursive: true });
const srtPath = path.join(workDir, 'transcript.srt');
await fs.copyFile(path.resolve(srtArg), srtPath);

const meta = await runMetadata(sourceTitle, srtPath, 'ja', path.basename(workDir), {
  outputDir: workDir,
  niche,
  imageStyle: 'soft clean warm illustration',
});
console.log('\n=== METADATA ===');
console.log('source    :', sourceTitle);
console.log('new title :', meta.metadata.title);
console.log('alt       :', (meta.alternative_titles ?? []).join(' / '));
console.log('format    :', JSON.stringify(meta.cluster_format));
console.log('hook_lines:', JSON.stringify((meta.thumbnail as Record<string, unknown> | undefined)?.hook_lines));

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
  count: Number(countArg) || 1,
  mascotImagePath: path.resolve(mascotArg),
  onLog: msg => console.log(msg),
});
console.log('\n=== THUMBNAIL ===');
for (const c of result.candidatesFile.candidates) {
  console.log(c.file ?? `FAILED: ${c.error}`, '|', c.angle, '|', JSON.stringify(c.hookLines));
}
process.exit(0);
