import fs from 'node:fs/promises';
import path from 'node:path';
import { youtubeChannelDir } from '../../../../config/paths.js';
import { pickClusterFormatChoice } from './metadata.types.js';

const RECENT_VIDEOS = 8;

/**
 * Formats picked by the channel's latest videos (newest first), from the `cluster_format` the cluster meta prompts
 * write into video-meta.json. Empty for channels whose niche prompt has no formats.
 */
export async function readRecentClusterFormats(
  channelId: string,
  excludeDir?: string,
  limit = RECENT_VIDEOS,
): Promise<string[]> {
  const videosDir = path.join(youtubeChannelDir(channelId), 'videos');
  let entries: string[];
  try {
    entries = await fs.readdir(videosDir);
  } catch {
    return [];
  }
  const found: Array<{ format: string; mtimeMs: number }> = [];
  for (const entry of entries) {
    const dir = path.join(videosDir, entry);
    if (excludeDir && path.resolve(dir) === path.resolve(excludeDir)) continue;
    const metaPath = path.join(dir, 'video-meta.json');
    try {
      const [raw, stat] = await Promise.all([fs.readFile(metaPath, 'utf8'), fs.stat(metaPath)]);
      const choice = pickClusterFormatChoice((JSON.parse(raw) as Record<string, unknown>).cluster_format);
      if (choice) found.push({ format: choice.format, mtimeMs: stat.mtimeMs });
    } catch {
      // no metadata yet / no format recorded
    }
  }
  return found
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map(item => item.format);
}

/** Appended to a cluster meta prompt so the format mix rotates when several formats fit the content. */
export function buildRecentFormatsHint(recentFormats: string[]): string {
  if (recentFormats.length === 0) return '';
  return (
    `\n\n==== FORMAT KÊNH ĐÃ DÙNG GẦN ĐÂY (mới nhất trước) ====\n${recentFormats.join(', ')}\n` +
    'Chỉ dùng để xoay vòng: khi nội dung hợp với nhiều format, ưu tiên format ít xuất hiện ở danh sách này. ' +
    'Không chọn format nội dung không hỗ trợ chỉ để xoay vòng. Giữ nguyên cấu trúc JSON đã yêu cầu.'
  );
}
