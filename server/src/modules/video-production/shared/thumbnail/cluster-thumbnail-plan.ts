import type { VideoMetaOutput } from '../meta/metadata.types.js';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Thumbnail plan written by a cluster meta prompt (`thumbnail.format / look / composition / rules / hook_lines ...`),
 * turned into the Director's FORMAT block. Empty when the niche prompt did not pick a format.
 */
export function describeClusterThumbnailPlan(meta: VideoMetaOutput | undefined): string {
  const raw = meta?.thumbnail as unknown;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
  const plan = raw as Record<string, unknown>;
  const format = text(plan.format) || meta?.cluster_format?.format || '';
  const composition = text(plan.composition);
  if (!format || !composition) return '';

  const hookLines = Array.isArray(plan.hook_lines) ? plan.hook_lines.map(text).filter(Boolean) : [];
  return [
    `Format: ${format}${text(plan.format_name) ? ` — ${text(plan.format_name)}` : ''}`,
    text(plan.look) ? `Giao diện của cụm (giữ cho mọi video của cụm): ${text(plan.look)}` : '',
    `Composition: ${composition}`,
    text(plan.rules) ? `Luật riêng: ${text(plan.rules)}` : '',
    hookLines.length > 0 ? `Hook gợi ý từ bước metadata: ${hookLines.join(' / ')}` : '',
    text(plan.emphasis) ? `Từ nhấn gợi ý: ${text(plan.emphasis)}` : '',
    text(plan.scene) ? `Bối cảnh gợi ý: ${text(plan.scene)}` : '',
    text(plan.mascot_pose) ? `Tư thế mascot gợi ý: ${text(plan.mascot_pose)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
