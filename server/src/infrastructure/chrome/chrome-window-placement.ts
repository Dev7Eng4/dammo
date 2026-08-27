import fs from 'node:fs/promises';
import path from 'node:path';

export interface ChromeWindowRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ChromeWorkArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Size used whenever a window has to be brought back onto the screen. */
export const CHROME_DEFAULT_WINDOW = { width: 1280, height: 800 } as const;

/** Used when Chrome has not recorded a work area yet (1920x1080 minus taskbar). */
const DEFAULT_WORK_AREA: ChromeWorkArea = { left: 0, top: 0, right: 1920, bottom: 1032 };

/** A window must overlap the work area by at least this much to count as reachable. */
const MIN_VISIBLE_PX = 50;

interface StoredWindowPlacement {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  maximized?: boolean;
  work_area_left?: number;
  work_area_top?: number;
  work_area_right?: number;
  work_area_bottom?: number;
}

export function centerRectInWorkArea(workArea: ChromeWorkArea = DEFAULT_WORK_AREA): ChromeWindowRect {
  const areaWidth = Math.max(MIN_VISIBLE_PX, workArea.right - workArea.left);
  const areaHeight = Math.max(MIN_VISIBLE_PX, workArea.bottom - workArea.top);
  const width = Math.min(CHROME_DEFAULT_WINDOW.width, areaWidth);
  const height = Math.min(CHROME_DEFAULT_WINDOW.height, areaHeight);

  return {
    left: Math.round(workArea.left + (areaWidth - width) / 2),
    top: Math.round(workArea.top + (areaHeight - height) / 2),
    width,
    height,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function resolveWorkArea(placement: StoredWindowPlacement): ChromeWorkArea {
  const right = placement.work_area_right;
  const bottom = placement.work_area_bottom;
  if (!isFiniteNumber(right) || !isFiniteNumber(bottom)) return DEFAULT_WORK_AREA;

  const left = isFiniteNumber(placement.work_area_left) ? placement.work_area_left : 0;
  const top = isFiniteNumber(placement.work_area_top) ? placement.work_area_top : 0;
  if (right - left < MIN_VISIBLE_PX || bottom - top < MIN_VISIBLE_PX) return DEFAULT_WORK_AREA;

  return { left, top, right, bottom };
}

/**
 * True when less than MIN_VISIBLE_PX of the window overlaps the work area, i.e. the
 * user cannot grab the title bar to drag it back (parked off-screen or clipped).
 */
function isUnreachable(placement: StoredWindowPlacement, workArea: ChromeWorkArea): boolean {
  const { left, top, right, bottom } = placement;
  if (!isFiniteNumber(left) || !isFiniteNumber(top) || !isFiniteNumber(right) || !isFiniteNumber(bottom)) {
    return true;
  }

  return (
    right <= workArea.left + MIN_VISIBLE_PX ||
    left >= workArea.right - MIN_VISIBLE_PX ||
    bottom <= workArea.top + MIN_VISIBLE_PX ||
    top >= workArea.bottom - MIN_VISIBLE_PX
  );
}

function preferencesPath(userDataDir: string): string {
  return path.join(userDataDir, 'Default', 'Preferences');
}

/**
 * Chrome persists the last window position in the profile's Preferences file, so a
 * profile previously parked off-screen reopens off-screen even without the
 * `--window-position` flag. Rewrites an unreachable placement to a centered rect.
 *
 * Returns the rect to launch with, so the very first window is on screen too.
 * Never throws: a broken Preferences file must not block opening Chrome.
 */
export async function resetChromeWindowPlacement(userDataDir: string): Promise<ChromeWindowRect> {
  const filePath = preferencesPath(userDataDir);

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const prefs = JSON.parse(raw) as { browser?: { window_placement?: StoredWindowPlacement } };
    const placement = prefs.browser?.window_placement;

    if (!placement) return centerRectInWorkArea();

    const workArea = resolveWorkArea(placement);
    const rect = centerRectInWorkArea(workArea);
    if (!isUnreachable(placement, workArea)) return rect;

    prefs.browser = prefs.browser ?? {};
    prefs.browser.window_placement = {
      ...placement,
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      maximized: false,
    };

    await fs.writeFile(filePath, JSON.stringify(prefs), 'utf8');
    console.log(
      `[chrome-profile] reset off-screen window placement (${placement.left},${placement.top}) → (${rect.left},${rect.top}) for ${userDataDir}`,
    );
    return rect;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[chrome-profile] failed to reset window placement for ${userDataDir}: ${detail}`);
    return centerRectInWorkArea();
  }
}
