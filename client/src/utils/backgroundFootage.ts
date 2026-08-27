/** UI sentinel for Assets → Video background footage (siLocalStock). */
export const LOCAL_STOCK_SENTINEL = '__local__';

export const LOCAL_STOCK_LABEL = 'Máy tính Local';

/**
 * Normalize MultiSelect values for background footage.
 * Local and source-channel IDs are exclusive: picking Local clears sources;
 * picking a source while Local is selected clears Local.
 */
export function normalizeBackgroundFootageSourceIds(selected: string[]): string[] {
  const trimmed = selected.map(id => id.trim()).filter(Boolean);
  const ids = [...new Set(trimmed)];

  if (!ids.includes(LOCAL_STOCK_SENTINEL)) {
    return ids;
  }

  const last = trimmed.at(-1);
  if (last === LOCAL_STOCK_SENTINEL) {
    return [LOCAL_STOCK_SENTINEL];
  }

  return ids.filter(id => id !== LOCAL_STOCK_SENTINEL);
}
