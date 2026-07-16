import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page, Request, Response } from 'playwright';
import { paths } from '../../config/paths.js';
import { AppError } from '../../shared/http/errors.js';
import { createFlowDailyQuotaError, isFlowDailyQuotaExhausted, throwIfFlowBatchGenerateFailed } from './flow-api-errors.js';
import { FLOW_TOOL_IDLE_MS, buildBatchGenerateImagesUrl } from './flow.config.js';
import type { FlowGenerateImageOptions, FlowToolVisual, LlmMediaAsset } from './llm-browser.types.js';

const BATCH_GENERATE_IMAGES_PATH = 'flowMedia:batchGenerateImages';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractFifeUrlFromMediaItem(item: unknown): string | null {
  if (!isRecord(item)) return null;

  const image = item.image;
  if (!isRecord(image)) return null;

  const generatedImage = image.generatedImage;
  if (!isRecord(generatedImage)) return null;

  const fifeUrl = generatedImage.fifeUrl;
  if (typeof fifeUrl === 'string' && fifeUrl.length > 0) return fifeUrl;

  const fileUrl = generatedImage.fileUrl;
  if (typeof fileUrl === 'string' && fileUrl.length > 0) return fileUrl;

  return null;
}

function findImageUrlRecursive(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageUrlRecursive(item);
      if (found) return found;
    }
    return null;
  }

  if (!isRecord(value)) return null;

  for (const key of ['fifeUrl', 'fileUrl'] as const) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.startsWith('http')) {
      return candidate;
    }
  }

  for (const nested of Object.values(value)) {
    const found = findImageUrlRecursive(nested);
    if (found) return found;
  }

  return null;
}

export function extractFifeUrl(payload: unknown): string {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const url = extractFifeUrlFromMediaItem(item);
      if (url) return url;
    }
  }

  if (isRecord(payload)) {
    const media = payload.media;
    if (Array.isArray(media)) {
      for (const item of media) {
        const url = extractFifeUrlFromMediaItem(item);
        if (url) return url;
      }
    }
  }

  const fallback = findImageUrlRecursive(payload);
  if (fallback) return fallback;

  throw new AppError('Flow API response missing image fifeUrl', 502, 'FLOW_API_NO_IMAGE_URL');
}

/** Extract structuredPrompt.parts[0].text from a batchGenerateImages media item. */
export function extractStructuredPromptText(item: unknown): string | null {
  if (!isRecord(item)) return null;

  const image = item.image;
  if (!isRecord(image)) return null;

  const generatedImage = image.generatedImage;
  if (!isRecord(generatedImage)) return null;

  const requestData = generatedImage.requestData;
  if (!isRecord(requestData)) return null;

  const promptInputs = requestData.promptInputs;
  if (!Array.isArray(promptInputs) || promptInputs.length === 0) return null;

  const firstInput = promptInputs[0];
  if (!isRecord(firstInput)) return null;

  const structuredPrompt = firstInput.structuredPrompt;
  if (!isRecord(structuredPrompt)) return null;

  const parts = structuredPrompt.parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;

  const firstPart = parts[0];
  if (!isRecord(firstPart)) return null;

  const text = firstPart.text;
  return typeof text === 'string' && text.trim().length > 0 ? text.trim() : null;
}

function listMediaItemsFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;

  if (isRecord(payload) && Array.isArray(payload.media)) {
    return payload.media;
  }

  return [];
}

function normalizePrompt(value: string): string {
  return value.trim();
}

function isBatchGenerateImagesRequest(request: Request, projectId: string): boolean {
  const url = request.url();
  return url.includes(BATCH_GENERATE_IMAGES_PATH) && url.includes(projectId) && request.method() === 'POST';
}

function normalizeJpgFileName(fileName: string): string {
  return `${path.parse(fileName).name}.jpg`;
}

function defaultTimestampFileName(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `flow-${timestamp}.jpg`;
}

export function resolveFlowImageSavePath(
  options?: Pick<FlowGenerateImageOptions, 'outputPath' | 'outputDir' | 'fileName'>,
): string {
  if (options?.outputPath) {
    const parsed = path.parse(options.outputPath);
    return path.join(parsed.dir, `${parsed.name}.jpg`);
  }

  const flowTestDir = path.join(paths.mediaDownloadsDir, 'flow-test');

  if (options?.outputDir && options?.fileName) {
    return path.join(path.resolve(options.outputDir), normalizeJpgFileName(options.fileName));
  }

  if (options?.outputDir) {
    return path.join(path.resolve(options.outputDir), defaultTimestampFileName());
  }

  if (options?.fileName) {
    return path.join(flowTestDir, normalizeJpgFileName(options.fileName));
  }

  return path.join(flowTestDir, defaultTimestampFileName());
}

/** @deprecated Use resolveFlowImageSavePath */
export function resolveFlowImageOutputPath(outputPath?: string): string {
  return resolveFlowImageSavePath({ outputPath });
}

export function beginBatchGenerateImagesWait(page: Page, projectId: string, timeoutMs: number): Promise<Response> {
  const expectedUrl = buildBatchGenerateImagesUrl(projectId);

  return page
    .waitForResponse(
      response => {
        const url = response.url();
        return url.includes(BATCH_GENERATE_IMAGES_PATH) && url.includes(projectId) && response.request().method() === 'POST';
      },
      { timeout: timeoutMs },
    )
    .then(async response => {
      console.log(`[flow-api] matched batchGenerateImages: ${response.url() || expectedUrl} (status=${response.status()})`);

      if (response.ok()) {
        return response;
      }

      let body: unknown = null;
      let bodyText = '';
      try {
        bodyText = await response.text();
        body = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        // keep raw text
      }

      throwIfFlowBatchGenerateFailed(response.status(), body, bodyText);
      // throwIfFlowBatchGenerateFailed always throws; satisfy TypeScript
      return response;
    });
}

export interface FlowToolMatchedImage {
  name: string;
  prompt: string;
  imageUrl: string;
}

export interface BeginFlowToolBatchCollectorOptions {
  page: Page;
  projectId: string;
  visuals: Pick<FlowToolVisual, 'name' | 'prompt'>[];
  timeoutMs: number;
  idleMs?: number;
  /** Called as soon as a prompt is matched; may download in parallel. */
  onMatch?: (match: FlowToolMatchedImage) => Promise<void> | void;
}

/**
 * Collect concurrent batchGenerateImages responses for the Flow tool.
 *
 * Matches each response item to a visual by comparing
 * `structuredPrompt.parts[0].text` with the visual prompt. Resolves once there
 * are no in-flight batchGenerateImages requests for `idleMs` (after at least one
 * request was seen). Rejects on overall timeout or unmatched visuals after idle.
 */
export function beginFlowToolBatchImagesCollector(
  options: BeginFlowToolBatchCollectorOptions,
): Promise<FlowToolMatchedImage[]> {
  const { page, projectId, visuals, timeoutMs, onMatch } = options;
  const idleMs = options.idleMs ?? FLOW_TOOL_IDLE_MS;

  return new Promise<FlowToolMatchedImage[]>((resolve, reject) => {
    const unmatched = new Map<string, { name: string; prompt: string }>();
    for (const visual of visuals) {
      unmatched.set(normalizePrompt(visual.prompt), { name: visual.name, prompt: visual.prompt });
    }

    const matched: FlowToolMatchedImage[] = [];
    const downloadTasks: Promise<void>[] = [];
    let pending = 0;
    let seenRequest = false;
    let settled = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      page.off('request', onRequest);
      page.off('response', onResponse);
      clearTimeout(overallTimer);
      if (idleTimer) clearTimeout(idleTimer);
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const scheduleIdleCheck = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (pending !== 0 || !seenRequest) return;

      idleTimer = setTimeout(() => {
        void (async () => {
          if (settled) return;
          if (pending !== 0) {
            scheduleIdleCheck();
            return;
          }

          try {
            await Promise.all(downloadTasks);
          } catch (err) {
            finish(() =>
              reject(err instanceof AppError ? err : new AppError(String(err), 502, 'FLOW_TOOL_DOWNLOAD_FAILED')),
            );
            return;
          }

          if (settled) return;
          if (pending !== 0) {
            scheduleIdleCheck();
            return;
          }

          if (unmatched.size > 0) {
            const missing = [...unmatched.values()].map(v => v.name).join(', ');
            finish(() =>
              reject(
                new AppError(
                  `Flow tool idle complete but missing images for: ${missing}`,
                  502,
                  'FLOW_TOOL_MISSING_IMAGES',
                ),
              ),
            );
            return;
          }

          console.log(`[flow-api] tool batch idle ${idleMs}ms — matched ${matched.length}/${visuals.length}`);
          finish(() => resolve(matched));
        })();
      }, idleMs);
    };

    const onRequest = (request: Request) => {
      if (!isBatchGenerateImagesRequest(request, projectId)) return;
      pending += 1;
      seenRequest = true;
      if (idleTimer) clearTimeout(idleTimer);
      console.log(`[flow-api] batchGenerateImages request started (pending=${pending})`);
    };

    const onResponse = (response: Response) => {
      if (!isBatchGenerateImagesRequest(response.request(), projectId)) return;

      pending = Math.max(0, pending - 1);
      console.log(`[flow-api] batchGenerateImages response (ok=${response.ok()}, pending=${pending})`);

      if (!response.ok()) {
        void (async () => {
          let body: unknown = null;
          let bodyText = '';
          try {
            bodyText = await response.text();
            body = bodyText ? JSON.parse(bodyText) : null;
          } catch {
            // keep raw text
          }

          if (isFlowDailyQuotaExhausted(response.status(), body)) {
            const detail =
              typeof body === 'object' &&
              body !== null &&
              typeof (body as { error?: { message?: unknown } }).error?.message === 'string'
                ? String((body as { error: { message: string } }).error.message)
                : bodyText.slice(0, 300);
            console.warn(
              `[flow-quota] tool batch hit daily quota after matching ${matched.length}/${visuals.length}`,
            );
            finish(() => reject(createFlowDailyQuotaError(detail)));
            return;
          }

          console.warn(
            `[flow-api] batchGenerateImages non-OK ${response.status()} (continuing idle check): ${bodyText.slice(0, 200)}`,
          );
          if (!settled) scheduleIdleCheck();
        })();
        return;
      }

      const handleBody = async () => {
        let payload: unknown;
        try {
          payload = await response.json();
        } catch (err) {
          console.error(`[flow-api] failed to parse batchGenerateImages JSON: ${err instanceof Error ? err.message : err}`);
          return;
        }

        const items = listMediaItemsFromPayload(payload);
        for (const item of items) {
          const promptText = extractStructuredPromptText(item);
          const imageUrl = extractFifeUrlFromMediaItem(item) ?? findImageUrlRecursive(item);
          if (!promptText || !imageUrl) {
            console.warn('[flow-api] skipping media item without prompt text or image url');
            continue;
          }

          const key = normalizePrompt(promptText);
          const visual = unmatched.get(key);
          if (!visual) {
            console.warn(`[flow-api] no unmatched visual for prompt (len=${promptText.length})`);
            continue;
          }

          unmatched.delete(key);
          const match: FlowToolMatchedImage = { name: visual.name, prompt: visual.prompt, imageUrl };
          matched.push(match);
          console.log(`[flow-api] matched prompt → ${visual.name} (${matched.length}/${visuals.length})`);

          if (onMatch) {
            downloadTasks.push(
              Promise.resolve(onMatch(match)).catch(err => {
                throw err instanceof AppError
                  ? err
                  : new AppError(
                      `Flow tool download failed for ${visual.name}: ${err instanceof Error ? err.message : String(err)}`,
                      502,
                      'FLOW_TOOL_DOWNLOAD_FAILED',
                    );
              }),
            );
          }
        }
      };

      void handleBody().finally(() => {
        if (!settled) scheduleIdleCheck();
      });
    };

    const overallTimer = setTimeout(() => {
      finish(() =>
        reject(
          new AppError(
            `Timed out waiting for Flow tool batchGenerateImages (matched ${matched.length}/${visuals.length}, pending=${pending})`,
            502,
            'FLOW_API_WAIT_TIMEOUT',
          ),
        ),
      );
    }, timeoutMs);

    page.on('request', onRequest);
    page.on('response', onResponse);
  });
}

/** @deprecated Prefer beginFlowToolBatchImagesCollector for tool flows. */
export function beginBatchGenerateImagesCollector(
  page: Page,
  projectId: string,
  expectedCount: number,
  timeoutMs: number,
): Promise<Response[]> {
  return new Promise<Response[]>((resolve, reject) => {
    const collected: Response[] = [];
    let settled = false;

    const cleanup = () => {
      page.off('response', onResponse);
      clearTimeout(timer);
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const onResponse = (response: Response) => {
      const url = response.url();
      if (
        !url.includes(BATCH_GENERATE_IMAGES_PATH) ||
        !url.includes(projectId) ||
        response.request().method() !== 'POST' ||
        !response.ok()
      ) {
        return;
      }

      collected.push(response);
      console.log(`[flow-api] collected batchGenerateImages ${collected.length}/${expectedCount}`);

      if (collected.length >= expectedCount) {
        finish(() => resolve(collected));
      }
    };

    const timer = setTimeout(() => {
      finish(() =>
        reject(
          new AppError(
            `Timed out waiting for ${expectedCount} Flow batchGenerateImages responses (got ${collected.length})`,
            502,
            'FLOW_API_WAIT_TIMEOUT',
          ),
        ),
      );
    }, timeoutMs);

    page.on('response', onResponse);
  });
}

export async function downloadAndSaveFlowImage(page: Page, imageUrl: string, outputPath: string): Promise<LlmMediaAsset> {
  const imageResponse = await page.request.get(imageUrl);
  if (!imageResponse.ok()) {
    throw new AppError(`Failed to download Flow image (${imageResponse.status()})`, 502, 'FLOW_IMAGE_DOWNLOAD_FAILED');
  }

  const imageBuffer = await imageResponse.body();
  const imageBase64 = imageBuffer.toString('base64');

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, imageBase64, 'base64');

  return { kind: 'image', sourceUrl: imageUrl, localPath: outputPath };
}
