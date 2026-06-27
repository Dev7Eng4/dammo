import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import { paths } from '../../config/paths.js';
import { AppError } from '../../shared/http/errors.js';
import type { LlmMediaAsset, MetaGenerateMediaOptions } from './llm-browser.types.js';

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

export async function downloadAndSaveMetaAsset(
  page: Page,
  sourceUrl: string,
  outputPath: string,
  kind: 'image' | 'video',
): Promise<LlmMediaAsset> {
  const response = await page.request.get(sourceUrl);
  if (!response.ok()) {
    throw new AppError(
      `Failed to download Meta ${kind} (${response.status()})`,
      502,
      'META_MEDIA_DOWNLOAD_FAILED',
    );
  }

  const buffer = await response.body();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buffer);

  return { kind, sourceUrl, localPath: outputPath };
}
