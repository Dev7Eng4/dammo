/** Normalize MultiSelect values for background footage sources (source channel IDs only). */
export function normalizeBackgroundFootageSourceIds(selected: string[]): string[] {
  return [...new Set(selected.map(id => id.trim()).filter(Boolean))];
}
