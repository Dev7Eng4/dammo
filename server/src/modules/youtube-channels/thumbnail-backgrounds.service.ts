import fs from 'node:fs';
import path from 'node:path';
import {
  youtubeChannelThumbnailBackgroundsDir,
  youtubeChannelThumbnailBackgroundsTempDir,
} from '../../config/paths.js';
import { AppError } from '../../shared/http/errors.js';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const IMAGE_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

export type ThumbnailBackgroundContentType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ThumbnailBackgroundUpload {
  buffer: Buffer;
  contentType: ThumbnailBackgroundContentType;
  originalName: string;
}

export interface ThumbnailBackgroundItem {
  name: string;
  url: string;
}

export interface ThumbnailBackgroundAsset {
  filePath: string;
  contentType: string;
  size: number;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sanitizeSessionId(sessionId: string): string {
  const trimmed = sessionId.trim();
  if (!SESSION_ID_PATTERN.test(trimmed)) {
    throw new AppError('Invalid temp session id', 400, 'INVALID_SESSION_ID');
  }
  return trimmed;
}

function sanitizeFileName(name: string): string {
  const base = path.basename(name).trim();
  if (!base || base === '.' || base === '..' || base.includes('/') || base.includes('\\')) {
    throw new AppError('Invalid file name', 400, 'INVALID_FILE_NAME');
  }
  const ext = path.extname(base).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) {
    throw new AppError('Unsupported image type', 400, 'UNSUPPORTED_FILE_TYPE');
  }
  return base;
}

function extensionForContentType(contentType: ThumbnailBackgroundContentType): string {
  switch (contentType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
  }
}

function contentTypeForExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
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

function resolveUploadFileName(upload: ThumbnailBackgroundUpload): string {
  const original = path.basename(upload.originalName || 'background').trim() || 'background';
  const stem = path.basename(original, path.extname(original)).replace(/[^\w.-]+/g, '_') || 'background';
  return `${stem}${extensionForContentType(upload.contentType)}`;
}

function listImagesInDir(dir: string, urlPrefix: string): ThumbnailBackgroundItem[] {
  ensureDir(dir);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const items: ThumbnailBackgroundItem[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;
    items.push({
      name: entry.name,
      url: `${urlPrefix}/${encodeURIComponent(entry.name)}`,
    });
  }

  return items.sort((a, b) => a.name.localeCompare(b.name));
}

function getAssetFromDir(dir: string, filename: string): ThumbnailBackgroundAsset {
  const safeName = sanitizeFileName(filename);
  const filePath = path.join(dir, safeName);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new AppError('Thumbnail background not found', 404, 'NOT_FOUND');
  }
  return {
    filePath,
    contentType: contentTypeForExtension(path.extname(safeName)),
    size: fs.statSync(filePath).size,
  };
}

async function writeUpload(dir: string, upload: ThumbnailBackgroundUpload): Promise<ThumbnailBackgroundItem> {
  if (upload.buffer.byteLength === 0) {
    throw new AppError('File is required', 400, 'VALIDATION_ERROR');
  }
  if (upload.buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new AppError('Image must not exceed 10 MB', 400, 'FILE_TOO_LARGE');
  }
  if (!IMAGE_CONTENT_TYPES.has(upload.contentType)) {
    throw new AppError('Image must be a JPEG, PNG, or WebP', 400, 'UNSUPPORTED_FILE_TYPE');
  }

  ensureDir(dir);
  const fileName = resolveUploadFileName(upload);
  const targetPath = uniqueFilePath(dir, fileName);
  await fs.promises.writeFile(targetPath, upload.buffer);
  const name = path.basename(targetPath);
  return { name, url: name };
}

function assertFileExistsInDir(dir: string, filename: string): string {
  const safeName = sanitizeFileName(filename);
  const filePath = path.join(dir, safeName);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new AppError('Selected thumbnail background not found', 400, 'BACKGROUND_NOT_FOUND');
  }
  return safeName;
}

function removeDirRecursive(dir: string): void {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

export class ThumbnailBackgroundsService {
  listForChannel(channelId: string, urlPrefix: string): ThumbnailBackgroundItem[] {
    return listImagesInDir(youtubeChannelThumbnailBackgroundsDir(channelId), urlPrefix);
  }

  listTemp(sessionId: string, urlPrefix: string): ThumbnailBackgroundItem[] {
    const safeSession = sanitizeSessionId(sessionId);
    return listImagesInDir(youtubeChannelThumbnailBackgroundsTempDir(safeSession), urlPrefix);
  }

  async uploadForChannel(
    channelId: string,
    upload: ThumbnailBackgroundUpload,
    urlPrefix: string,
  ): Promise<ThumbnailBackgroundItem> {
    const item = await writeUpload(youtubeChannelThumbnailBackgroundsDir(channelId), upload);
    return { ...item, url: `${urlPrefix}/${encodeURIComponent(item.name)}` };
  }

  async uploadTemp(
    sessionId: string,
    upload: ThumbnailBackgroundUpload,
    urlPrefix: string,
  ): Promise<ThumbnailBackgroundItem> {
    const safeSession = sanitizeSessionId(sessionId);
    const item = await writeUpload(youtubeChannelThumbnailBackgroundsTempDir(safeSession), upload);
    return { ...item, url: `${urlPrefix}/${encodeURIComponent(item.name)}` };
  }

  getChannelAsset(channelId: string, filename: string): ThumbnailBackgroundAsset {
    return getAssetFromDir(youtubeChannelThumbnailBackgroundsDir(channelId), filename);
  }

  getTempAsset(sessionId: string, filename: string): ThumbnailBackgroundAsset {
    return getAssetFromDir(youtubeChannelThumbnailBackgroundsTempDir(sanitizeSessionId(sessionId)), filename);
  }

  assertChannelFile(channelId: string, filename: string): string {
    return assertFileExistsInDir(youtubeChannelThumbnailBackgroundsDir(channelId), filename);
  }

  deleteForChannel(channelId: string, filename: string): string {
    const asset = this.getChannelAsset(channelId, filename);
    fs.unlinkSync(asset.filePath);
    return path.basename(asset.filePath);
  }

  deleteTemp(sessionId: string, filename: string): string {
    const asset = this.getTempAsset(sessionId, filename);
    fs.unlinkSync(asset.filePath);
    return path.basename(asset.filePath);
  }

  moveTempToChannel(sessionId: string, channelId: string): void {
    const safeSession = sanitizeSessionId(sessionId);
    const tempDir = youtubeChannelThumbnailBackgroundsTempDir(safeSession);
    const targetDir = youtubeChannelThumbnailBackgroundsDir(channelId);
    ensureDir(targetDir);

    if (!fs.existsSync(tempDir)) {
      return;
    }

    const entries = fs.readdirSync(tempDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;

      const sourcePath = path.join(tempDir, entry.name);
      const destPath = uniqueFilePath(targetDir, entry.name);
      try {
        fs.renameSync(sourcePath, destPath);
      } catch {
        fs.copyFileSync(sourcePath, destPath);
        fs.unlinkSync(sourcePath);
      }
    }

    const sessionRoot = path.dirname(tempDir);
    removeDirRecursive(sessionRoot);
  }
}

export const thumbnailBackgroundsService = new ThumbnailBackgroundsService();
