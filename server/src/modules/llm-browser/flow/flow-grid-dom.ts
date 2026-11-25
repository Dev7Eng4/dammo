import type { Page } from 'playwright';
import { AppError } from '../../../shared/http/errors.js';
import { appErrorFromFlowErrorTileText } from './api/flow-api-errors.js';
import { FLOW_CONFIG, flowAsbAssetKey, isFlowAsbImageUrl } from './flow.config.js';

/**
 * Finds newly generated images / videos in the Flow project grid.
 *
 * Flow no longer exposes result URLs in an API response, so results are read from the DOM (newest
 * tiles first). Snapshot the grid before submitting, then poll for a tile that was not there before:
 * - image: `flow-image-tile img.image[data-media-id]`, `src=".../asb/<token>=s1600-rw"`
 * - video: `flow-video-tile` → `img.thumbnail` (`.../asb/<token>`); hovering inserts
 *   `<video src=".../asb/<token>=mm,18,15">` (mp4). No media id, so tiles are keyed by token.
 *
 * Note: no named function expressions inside `page.evaluate` callbacks: tsx/esbuild wraps them in a
 * `__name()` helper that does not exist in the page.
 */

const POLL_MS = 1_000;

/** Uploaded references show their file name in the tile footer; generated images show a caption. */
const UPLOAD_LABEL_PATTERN = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Newest tiles render at the top of the virtual grid; scroll every scrolled ancestor back to 0. */
async function scrollGridToTop(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      for (const el of document.querySelectorAll('.virtual-scroll-container, cdk-virtual-scroll-viewport')) {
        let node: HTMLElement | null = el as HTMLElement;
        while (node) {
          if (node.scrollTop > 0) node.scrollTop = 0;
          node = node.parentElement;
        }
      }
    })
    .catch(() => undefined);
}

// ---------------------------------------------------------------------------------------------- image

export interface FlowGridImage {
  mediaId: string;
  src: string;
}

interface GridImageTile extends FlowGridImage {
  loaded: boolean;
  /** Tile footer label: a short caption for generated images, the file name for uploads. */
  label: string;
}

function imageTileKey(tile: FlowGridImage): string {
  return tile.mediaId || tile.src;
}

async function readGridImageTiles(page: Page): Promise<GridImageTile[]> {
  await scrollGridToTop(page);
  return page
    .evaluate(
      ({ imageSelector, tileSelector }) =>
        [...document.querySelectorAll<HTMLImageElement>(imageSelector)].map(img => ({
          mediaId: img.getAttribute('data-media-id') ?? '',
          src: img.currentSrc || img.src,
          loaded: img.complete && img.naturalWidth > 0,
          label:
            img
              .closest(tileSelector)
              ?.querySelector('flow-tile-hover-footer button')
              ?.getAttribute('aria-label')
              ?.trim() ?? '',
        })),
      { imageSelector: FLOW_CONFIG.selectors.gridImage, tileSelector: FLOW_CONFIG.selectors.gridTile },
    )
    .catch(() => []);
}

/** Ids of the image tiles currently in the grid; take this before submitting a prompt. */
export async function snapshotFlowGridImageIds(page: Page): Promise<Set<string>> {
  const tiles = await readGridImageTiles(page);
  return new Set(tiles.map(imageTileKey));
}

export interface WaitForNewFlowGridImageOptions {
  timeoutMs: number;
  /** Stops polling early (e.g. an error tile was found); the wait then rejects. */
  isCancelled?: () => boolean;
}

/**
 * Polls the grid until an image tile that was not in `knownIds` shows a loaded `/asb/` src.
 * Uploaded reference images (footer label is a file name) are skipped.
 */
export async function waitForNewFlowGridImage(
  page: Page,
  knownIds: ReadonlySet<string>,
  options: WaitForNewFlowGridImageOptions,
): Promise<FlowGridImage> {
  const deadline = Date.now() + options.timeoutMs;

  while (Date.now() < deadline) {
    if (options.isCancelled?.()) {
      throw new AppError('Flow image wait cancelled', 499, 'FLOW_IMAGE_WAIT_CANCELLED');
    }

    const tiles = await readGridImageTiles(page);
    const fresh = tiles.find(
      tile => !knownIds.has(imageTileKey(tile)) && isFlowAsbImageUrl(tile.src) && !UPLOAD_LABEL_PATTERN.test(tile.label),
    );
    if (fresh?.loaded) {
      console.log(`[flow-dom] new image tile ${fresh.mediaId || '(no media id)'}: ${fresh.src.slice(0, 80)}...`);
      return { mediaId: fresh.mediaId, src: fresh.src };
    }

    await sleep(POLL_MS);
  }

  throw new AppError(
    `Timed out waiting for a new Flow image tile (${options.timeoutMs}ms)`,
    504,
    'FLOW_IMAGE_WAIT_TIMEOUT',
  );
}

// ---------------------------------------------------------------------------------------------- video

interface GridVideoTile {
  /** Position among the video tiles (for hovering it). */
  index: number;
  /** `/asb/` token key, from the `<video>` src or else the thumbnail (same token). */
  key: string;
  /** `<video>` src; empty until the tile has been hovered. */
  videoSrc: string;
}

interface GridVideoState {
  videoTiles: GridVideoTile[];
  /** Rendered error tiles. */
  errorCount: number;
  /** Rough identity of the first (newest) tile, to tell when a new tile was inserted on top. */
  firstTileSignature: string;
  /** Text of the error tile in the first grid tile, if it is one. */
  firstTileError: string | null;
}

const VIDEO_HOVER_WAIT_MS = 6_000;

async function readGridVideoState(page: Page): Promise<GridVideoState> {
  await scrollGridToTop(page);
  const raw = await page
    .evaluate(
      ({ videoTileSelector, tileSelector, errorSelector }) => {
        const first = document.querySelector(tileSelector);
        const firstError = first?.querySelector(errorSelector) ?? null;
        return {
          videoTiles: [...document.querySelectorAll(videoTileSelector)].map((tile, index) => ({
            index,
            videoSrc: tile.querySelector('video')?.getAttribute('src') ?? '',
            thumbnailSrc: tile.querySelector('img.thumbnail')?.getAttribute('src') ?? '',
          })),
          errorCount: document.querySelectorAll(errorSelector).length,
          firstTileSignature: first
            ? [
                first.getAttribute('aria-label') ?? '',
                first.querySelector('img, video')?.getAttribute('src') ?? '',
                (first.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
              ].join('|')
            : '',
          firstTileError: firstError ? (firstError.textContent ?? '').replace(/\s+/g, ' ').trim() : null,
        };
      },
      {
        videoTileSelector: FLOW_CONFIG.selectors.gridVideoTile,
        tileSelector: FLOW_CONFIG.selectors.gridTile,
        errorSelector: FLOW_CONFIG.selectors.flowErrorTile,
      },
    )
    .catch(() => ({ videoTiles: [], errorCount: 0, firstTileSignature: '', firstTileError: null }));

  const videoTiles: GridVideoTile[] = [];
  for (const tile of raw.videoTiles) {
    const source = isFlowAsbImageUrl(tile.videoSrc) ? tile.videoSrc : tile.thumbnailSrc;
    if (!isFlowAsbImageUrl(source)) continue;
    videoTiles.push({ index: tile.index, key: flowAsbAssetKey(source), videoSrc: tile.videoSrc });
  }
  return { ...raw, videoTiles };
}

/** Hovers a video tile so Flow inserts its `<video>`, then reads that src (`.../asb/<token>=mm,18,15`). */
async function readVideoSrcByHover(page: Page, index: number): Promise<string> {
  const tile = page.locator(FLOW_CONFIG.selectors.gridVideoTile).nth(index);
  try {
    await tile.hover({ timeout: 5_000 });
    const video = tile.locator('video').first();
    await video.waitFor({ state: 'attached', timeout: VIDEO_HOVER_WAIT_MS });
    return (await video.getAttribute('src')) ?? '';
  } catch {
    return '';
  } finally {
    await page.mouse.move(2, 2).catch(() => undefined);
  }
}

export interface FlowGridVideoSnapshot {
  videoKeys: Set<string>;
  errorCount: number;
  firstTileSignature: string;
}

/** Videos and error tiles currently in the grid; take this before submitting a clip. */
export async function snapshotFlowGridVideos(page: Page): Promise<FlowGridVideoSnapshot> {
  const state = await readGridVideoState(page);
  return {
    videoKeys: new Set(state.videoTiles.map(tile => tile.key)),
    errorCount: state.errorCount,
    firstTileSignature: state.firstTileSignature,
  };
}

export type FlowGridVideoPoll =
  | { kind: 'pending' }
  | { kind: 'done'; src: string }
  | { kind: 'error'; error: AppError };

/**
 * One look at the grid. A video tile whose `/asb/` token was not in the snapshot is our clip: hover it
 * and take its `<video>` src (no `<video>` yet means still pending). A new error tile on top (first
 * tile changed, or more error tiles than before) means it failed.
 */
export async function pollFlowGridVideo(page: Page, snapshot: FlowGridVideoSnapshot): Promise<FlowGridVideoPoll> {
  const state = await readGridVideoState(page);

  const fresh = state.videoTiles.find(tile => !snapshot.videoKeys.has(tile.key));
  if (fresh) {
    const src = isFlowAsbImageUrl(fresh.videoSrc) ? fresh.videoSrc : await readVideoSrcByHover(page, fresh.index);
    if (isFlowAsbImageUrl(src)) return { kind: 'done', src };
  }

  const newErrorOnTop =
    state.firstTileError !== null &&
    (state.firstTileSignature !== snapshot.firstTileSignature || state.errorCount > snapshot.errorCount);
  if (newErrorOnTop) {
    return { kind: 'error', error: appErrorFromFlowErrorTileText(state.firstTileError || 'unknown flow-error-tile') };
  }

  return { kind: 'pending' };
}
