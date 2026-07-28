import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../../config/paths.js';
import { AppError } from '../../shared/http/errors.js';
import type { AssetFileItem, AssetKind } from './assets.types.js';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov']);
const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.woff', '.woff2']);
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
  }
}

function allowedExtensions(kind: AssetKind): Set<string> {
  return kind === 'fonts' ? FONT_EXTENSIONS : VIDEO_EXTENSIONS;
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

export class AssetsService {
  list(kind: AssetKind): AssetFileItem[] {
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

    return items.sort((a, b) => a.name.localeCompare(b.name));
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
    const contentType = ext === '.mov' ? 'video/quicktime' : 'video/mp4';
    return {
      filePath,
      contentType,
      size: fs.statSync(filePath).size,
    };
  }
}

export const assetsService = new AssetsService();
