import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page, Response } from 'playwright';
import { paths } from '../../config/paths.js';
import { AppError } from '../../shared/http/errors.js';
import { buildBatchGenerateImagesUrl } from './flow.config.js';
import type { FlowGenerateImageOptions, LlmMediaAsset } from './llm-browser.types.js';

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

  return page.waitForResponse(
    response => {
      const url = response.url();
      return url.includes(BATCH_GENERATE_IMAGES_PATH) && url.includes(projectId) && response.request().method() === 'POST' && response.ok();
    },
    { timeout: timeoutMs },
  ).then(response => {
    console.log(`[flow-api] matched batchGenerateImages: ${response.url() || expectedUrl}`);
    return response;
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
