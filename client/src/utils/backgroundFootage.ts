import type { BackgroundFootageMode } from '../types/youtubeChannel';
import { BACKGROUND_FOOTAGE_LOCAL_SENTINEL } from '../types/youtubeChannel';

export function buildBackgroundFootageSelectValue(
  mode: BackgroundFootageMode,
  sourceIds: string[],
): string[] {
  if (mode === 'local') {
    return [BACKGROUND_FOOTAGE_LOCAL_SENTINEL];
  }
  return sourceIds;
}

export function resolveBackgroundFootageSelection(selected: string[]): {
  mode: BackgroundFootageMode;
  sourceIds: string[];
} {
  if (selected.includes(BACKGROUND_FOOTAGE_LOCAL_SENTINEL)) {
    return { mode: 'local', sourceIds: [] };
  }

  return {
    mode: 'source',
    sourceIds: selected.filter(value => value !== BACKGROUND_FOOTAGE_LOCAL_SENTINEL),
  };
}

export function handleBackgroundFootageSelectChange(
  previous: string[],
  next: string[],
): { mode: BackgroundFootageMode; sourceIds: string[]; value: string[] } {
  const addedLocal =
    !previous.includes(BACKGROUND_FOOTAGE_LOCAL_SENTINEL) &&
    next.includes(BACKGROUND_FOOTAGE_LOCAL_SENTINEL);
  const addedSource = next.some(
    value => value !== BACKGROUND_FOOTAGE_LOCAL_SENTINEL && !previous.includes(value),
  );

  if (addedLocal) {
    return {
      mode: 'local',
      sourceIds: [],
      value: [BACKGROUND_FOOTAGE_LOCAL_SENTINEL],
    };
  }

  if (addedSource) {
    const sourceIds = next.filter(value => value !== BACKGROUND_FOOTAGE_LOCAL_SENTINEL);
    return {
      mode: 'source',
      sourceIds,
      value: sourceIds,
    };
  }

  return {
    ...resolveBackgroundFootageSelection(next),
    value: next.filter(value => value !== BACKGROUND_FOOTAGE_LOCAL_SENTINEL),
  };
}
