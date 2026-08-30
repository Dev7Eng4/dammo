import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import { paths } from '../../config/paths.js';
import { resizeImageToFit } from '../ffmpeg/image-resize.js';
import { AppError } from '../../shared/http/errors.js';
import { isBlobUrl, isHttpUrl } from './meta-image-url.js';
import type { LlmMediaAsset, MetaGenerateMediaOptions } from './llm-browser.types.js';

export const META_IMAGE_WIDTH = 1280;
export const META_IMAGE_HEIGHT = 720;

function normalizeFileName(fileName: string, ext: string): string {
  const parsed = path.parse(fileName);
  const suffix = ext.startsWith('.') ? ext : `.${ext}`;
  return `${parsed.name}${suffix}`;
}

function defaultTimestampFileName(kind: 'image' | 'video'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `meta-${kind}-${timestamp}${kind === 'video' ? '.mp4' : '.jpg'}`;
}

function defaultExtension(kind: 'image' | 'video'): string {
  return kind === 'video' ? '.mp4' : '.jpg';
}

function resolveMetaMediaBaseName(
  options?: Pick<MetaGenerateMediaOptions, 'outputPath' | 'fileName'>,
): string {
  if (options?.fileName?.trim()) {
    return path.parse(options.fileName.trim()).name;
  }
  if (options?.outputPath?.trim()) {
    return path.parse(options.outputPath.trim()).name;
  }
  return 'meta-image';
}

function resolveMetaMediaOutputDir(
  options?: Pick<MetaGenerateMediaOptions, 'outputPath' | 'outputDir'>,
): string {
  if (options?.outputDir?.trim()) {
    return path.resolve(options.outputDir.trim());
  }
  if (options?.outputPath?.trim()) {
    return path.dirname(path.resolve(options.outputPath.trim()));
  }
  return path.join(paths.mediaDownloadsDir, 'meta-test');
}

export function resolveMetaMediaIndexedSavePaths(
  count: number,
  kind: 'image' | 'video',
  options?: Pick<MetaGenerateMediaOptions, 'outputPath' | 'outputDir' | 'fileName'>,
): string[] {
  if (count <= 0) return [];

  const ext = defaultExtension(kind);
  const dir = resolveMetaMediaOutputDir(options);
  const baseName = resolveMetaMediaBaseName(options);

  return Array.from({ length: count }, (_, index) =>
    path.join(dir, `${baseName}-${index + 1}${ext}`),
  );
}

export function resolveMetaMediaSavePath(
  kind: 'image' | 'video',
  options?: Pick<MetaGenerateMediaOptions, 'outputPath' | 'outputDir' | 'fileName'>,
): string {
  const ext = defaultExtension(kind);

  if (options?.outputPath) {
    const parsed = path.parse(options.outputPath);
    return path.join(parsed.dir, `${parsed.name}${ext}`);
  }

  const metaTestDir = path.join(paths.mediaDownloadsDir, 'meta-test');

  if (options?.outputDir && options?.fileName) {
    return path.join(path.resolve(options.outputDir), normalizeFileName(options.fileName, ext));
  }

  if (options?.outputDir) {
    return path.join(path.resolve(options.outputDir), defaultTimestampFileName(kind));
  }

  if (options?.fileName) {
    return path.join(metaTestDir, normalizeFileName(options.fileName, ext));
  }

  return path.join(metaTestDir, defaultTimestampFileName(kind));
}

async function fetchBlobInBrowser(page: Page, blobUrl: string): Promise<Buffer> {
  const bytes = await page.evaluate(async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`blob fetch failed (${response.status})`);
    }
    const buffer = await response.arrayBuffer();
    return Array.from(new Uint8Array(buffer));
  }, blobUrl);

  return Buffer.from(bytes);
}

async function downloadMetaAssetBuffer(page: Page, sourceUrl: string, kind: 'image' | 'video'): Promise<Buffer> {
  if (isHttpUrl(sourceUrl)) {
    const response = await page.request.get(sourceUrl);
    if (!response.ok()) {
      throw new AppError(
        `Failed to download Meta ${kind} (${response.status()})`,
        502,
        'META_MEDIA_DOWNLOAD_FAILED',
      );
    }
    return response.body();
  }

  if (isBlobUrl(sourceUrl)) {
    try {
      return await fetchBlobInBrowser(page, sourceUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AppError(
        `Failed to download Meta ${kind} blob: ${message}`,
        502,
        'META_MEDIA_BLOB_DOWNLOAD_FAILED',
      );
    }
  }

  throw new AppError(
    `Unsupported Meta ${kind} source URL: ${sourceUrl.slice(0, 80)}`,
    502,
    'META_MEDIA_UNSUPPORTED_URL',
  );
}

export async function downloadAndSaveMetaAsset(
  page: Page,
  sourceUrl: string,
  outputPath: string,
  kind: 'image' | 'video',
  aspectRatio: '16:9' | '3:4' = '16:9',
): Promise<LlmMediaAsset> {
  const buffer = await downloadMetaAssetBuffer(page, sourceUrl, kind);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  if (kind === 'image' && aspectRatio === '16:9') {
    const tmpPath = `${outputPath}.download.tmp`;
    try {
      await fs.writeFile(tmpPath, buffer);
      await resizeImageToFit(tmpPath, outputPath, META_IMAGE_WIDTH, META_IMAGE_HEIGHT);
    } finally {
      await fs.unlink(tmpPath).catch(() => undefined);
    }
  } else {
    await fs.writeFile(outputPath, buffer);
  }

  return { kind, sourceUrl, localPath: outputPath };
}
