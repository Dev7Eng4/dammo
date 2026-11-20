import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { paths } from '../../config/paths.js';
import { runFfmpeg } from '../../infrastructure/ffmpeg/ffmpeg-runner.js';
import { appSettingsService } from '../app-settings/app-settings.service.js';
import { runBrowserImageGeneration } from '../video-production/shared/thumbnail/hero-image.js';
import { AppError } from '../../shared/http/errors.js';
import type { AssetFileItem, AssetKind } from './assets.types.js';
import { getPreparedColorAssetPath, type PrepareColorKind } from '../video-production/shared/si-video/si-prepare-color-cache.js';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov']);
const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.woff', '.woff2']);
const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};
const IMAGE_EXTENSIONS = new Set(Object.keys(IMAGE_CONTENT_TYPES));
const BLOCKED_NAMES = new Set(['usage.json']);

function resolveKindDir(kind: AssetKind): string {
  switch (kind) {
    case 'audioBar':
      return paths.siAudioBarDir;
    case 'fonts':
      return path.join(paths.reupSiAssetsDir, 'fonts');
    case 'smallVideo':
      return paths.siSmallVideoDir;
    case 'siLocalStock':
      return paths.siLocalStockDir;
    case 'subscribe':
      return paths.siSubscribeDir;
    case 'mascot':
      return paths.mascotLibraryDir;
  }
}

function allowedExtensions(kind: AssetKind): Set<string> {
  if (kind === 'fonts') return FONT_EXTENSIONS;
  if (kind === 'mascot') return IMAGE_EXTENSIONS;
  return VIDEO_EXTENSIONS;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sanitizeFileName(name: string): string {
  const base = path.basename(name).trim();
  if (!base || base === '.' || base === '..' || base.includes('/') || base.includes('\\')) {
    throw new AppError('Invalid file name', 400, 'INVALID_FILE_NAME');
  }
  if (BLOCKED_NAMES.has(base.toLowerCase())) {
    throw new AppError('This file cannot be managed', 400, 'PROTECTED_FILE');
  }
  return base;
}

function assertAllowedExtension(kind: AssetKind, fileName: string): void {
  const ext = path.extname(fileName).toLowerCase();
  if (!allowedExtensions(kind).has(ext)) {
    throw new AppError(
      `Unsupported file type for ${kind}: ${ext || '(none)'}`,
      400,
      'UNSUPPORTED_FILE_TYPE',
    );
  }
}

function uniqueFilePath(dir: string, fileName: string): string {
  const target = path.join(dir, fileName);
  if (!fs.existsSync(target)) return target;

  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);
  let index = 1;
  while (true) {
    const candidate = path.join(dir, `${stem}_${index}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    index += 1;
  }
}

/** Originals replaced by "remove watermark" are kept here (a sub-folder, so the library list ignores it). */
const WATERMARK_BACKUP_DIR = '.watermark-backup';
const watermarkRemovalsInFlight = new Set<string>();

export class AssetsService {
  async list(kind: AssetKind): Promise<AssetFileItem[]> {
    const dir = resolveKindDir(kind);
    ensureDir(dir);

    const allowed = allowedExtensions(kind);
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const items: AssetFileItem[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (BLOCKED_NAMES.has(entry.name.toLowerCase())) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!allowed.has(ext)) continue;

      const fullPath = path.join(dir, entry.name);
      const stat = fs.statSync(fullPath);
      items.push({
        name: entry.name,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
    }

    const sorted = items.sort((a, b) => a.name.localeCompare(b.name));

    if (kind === 'audioBar' || kind === 'subscribe') {
      await Promise.all(
        sorted.map(async (item) => {
          try {
            const result = await getPreparedColorAssetPath(kind as PrepareColorKind, item.name);
            item.prepared = result.prepared;
          } catch {
            item.prepared = false;
          }
        }),
      );
    }

    return sorted;
  }

  async upload(kind: AssetKind, file: File): Promise<AssetFileItem> {
    if (!(file instanceof File) || file.size === 0) {
      throw new AppError('File is required', 400, 'FILE_REQUIRED');
    }

    const safeName = sanitizeFileName(file.name);
    assertAllowedExtension(kind, safeName);

    const dir = resolveKindDir(kind);
    ensureDir(dir);

    const destPath = uniqueFilePath(dir, safeName);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(destPath, buffer);

    const stat = fs.statSync(destPath);
    return {
      name: path.basename(destPath),
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
    };
  }

  delete(kind: AssetKind, names: string[]): { deleted: string[] } {
    const dir = resolveKindDir(kind);
    ensureDir(dir);

    const deleted: string[] = [];
    for (const rawName of names) {
      const safeName = sanitizeFileName(rawName);
      assertAllowedExtension(kind, safeName);

      const fullPath = path.join(dir, safeName);
      if (!fullPath.startsWith(dir + path.sep) && fullPath !== dir) {
        throw new AppError('Invalid file path', 400, 'INVALID_FILE_PATH');
      }
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        continue;
      }
      fs.unlinkSync(fullPath);
      deleted.push(safeName);
    }

    if (deleted.length === 0) {
      throw new AppError('No matching files to delete', 400, 'NO_FILES_DELETED');
    }

    return { deleted };
  }

  /** Rename a file; the extension is kept from the original when `newName` has none. */
  rename(kind: AssetKind, oldName: string, newName: string): AssetFileItem {
    const dir = resolveKindDir(kind);
    ensureDir(dir);

    const safeOld = sanitizeFileName(oldName);
    assertAllowedExtension(kind, safeOld);
    const oldPath = path.join(dir, safeOld);
    if (!fs.existsSync(oldPath) || !fs.statSync(oldPath).isFile()) {
      throw new AppError('Asset not found', 404, 'NOT_FOUND');
    }

    const oldExt = path.extname(safeOld);
    let target = sanitizeFileName(newName);
    if (path.extname(target).toLowerCase() !== oldExt.toLowerCase()) {
      target = `${target}${oldExt}`;
    }
    assertAllowedExtension(kind, target);
    if (target === safeOld) {
      const stat = fs.statSync(oldPath);
      return { name: safeOld, size: stat.size, updatedAt: stat.mtime.toISOString() };
    }

    const newPath = path.join(dir, target);
    const caseOnlyChange = target.toLowerCase() === safeOld.toLowerCase();
    if (!caseOnlyChange && fs.existsSync(newPath)) {
      throw new AppError(`A file named "${target}" already exists`, 409, 'NAME_TAKEN');
    }
    fs.renameSync(oldPath, newPath);

    const stat = fs.statSync(newPath);
    return { name: target, size: stat.size, updatedAt: stat.mtime.toISOString() };
  }

  getAsset(kind: AssetKind, filename: string): { filePath: string; contentType: string; size: number } {
    if (kind === 'fonts') {
      throw new AppError('Font assets cannot be streamed', 400, 'UNSUPPORTED_ASSET_KIND');
    }

    const safeName = sanitizeFileName(filename);
    assertAllowedExtension(kind, safeName);

    const dir = resolveKindDir(kind);
    const filePath = path.join(dir, safeName);
    if (!filePath.startsWith(dir + path.sep) && filePath !== dir) {
      throw new AppError('Invalid file path', 400, 'INVALID_FILE_PATH');
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new AppError('Asset not found', 404, 'NOT_FOUND');
    }

    const ext = path.extname(safeName).toLowerCase();
    const contentType = IMAGE_CONTENT_TYPES[ext] ?? (ext === '.mov' ? 'video/quicktime' : 'video/mp4');
    return {
      filePath,
      contentType,
      size: fs.statSync(filePath).size,
    };
  }

  /**
   * Manual "remove watermark" for a mascot image, like the thumbnail button: regenerate the image through
   * Meta with the prompt from Settings (the image attached as the only reference), then write the result
   * over the same file name and format so channels that use this mascot keep working. The original is
   * copied to `.watermark-backup/` first.
   */
  async removeWatermark(kind: AssetKind, filename: string): Promise<AssetFileItem> {
    if (kind !== 'mascot') {
      throw new AppError('Watermark removal is only supported for mascot', 400, 'UNSUPPORTED_ASSET_KIND');
    }
    const asset = this.getAsset(kind, filename);
    const name = path.basename(asset.filePath);
    if (watermarkRemovalsInFlight.has(name)) {
      throw new AppError('Watermark removal is already running for this image', 409, 'WATERMARK_REMOVAL_IN_PROGRESS');
    }

    watermarkRemovalsInFlight.add(name);
    const ext = path.extname(name).toLowerCase();
    // Short ASCII-only work dir: the browser upload of the reference needs a plain path.
    const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mascot-nowm-'));
    try {
      const referencePath = path.join(workDir, `ref-mascot${ext}`);
      await fs.promises.copyFile(asset.filePath, referencePath);

      const { removeGeminiWatermarkPrompt } = appSettingsService.get();
      let generatedPath: string;
      try {
        const result = await runBrowserImageGeneration(removeGeminiWatermarkPrompt, workDir, {
          provider: 'meta',
          fileName: 'mascot-nowm.jpg',
          referenceImagePaths: [referencePath],
          skipResize: true,
        });
        generatedPath = result.imagePath;
        await fs.promises.access(generatedPath);
      } catch (error) {
        if (error instanceof AppError) throw error;
        const detail = error instanceof Error ? error.message : String(error);
        throw new AppError(`Watermark removal failed: ${detail}`, 502, 'WATERMARK_REMOVAL_FAILED');
      }

      // Meta returns a JPEG; keep the library file's own format (and name).
      let outputPath = generatedPath;
      if (ext !== '.jpg' && ext !== '.jpeg') {
        outputPath = path.join(workDir, `mascot-nowm${ext}`);
        await runFfmpeg(['-y', '-i', generatedPath, '-frames:v', '1', outputPath]);
      }

      const backupDir = path.join(path.dirname(asset.filePath), WATERMARK_BACKUP_DIR);
      ensureDir(backupDir);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await fs.promises.copyFile(asset.filePath, path.join(backupDir, `${stamp}-${name}`));
      await fs.promises.copyFile(outputPath, asset.filePath);

      const stat = fs.statSync(asset.filePath);
      return { name, size: stat.size, updatedAt: stat.mtime.toISOString() };
    } finally {
      watermarkRemovalsInFlight.delete(name);
      await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export const assetsService = new AssetsService();

/** Mascot library image, read for copying into a YouTube channel. */
export function readMascotLibraryImage(name: string): { buffer: Buffer; contentType: string } {
  const asset = assetsService.getAsset('mascot', name);
  return { buffer: fs.readFileSync(asset.filePath), contentType: asset.contentType };
}

/** sha256 of every mascot library image, keyed by file name. */
export async function hashMascotLibraryImages(): Promise<Map<string, string>> {
  const items = await assetsService.list('mascot');
  const hashes = new Map<string, string>();
  for (const item of items) {
    try {
      const asset = assetsService.getAsset('mascot', item.name);
      hashes.set(item.name, createHash('sha256').update(fs.readFileSync(asset.filePath)).digest('hex'));
    } catch {
      // skip unreadable files
    }
  }
  return hashes;
}
