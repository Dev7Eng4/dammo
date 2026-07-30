import fs from 'node:fs';
import path from 'node:path';
import {
  youtubeChannelAvatarTempDir,
  youtubeChannelDir,
} from '../../config/paths.js';
import { AppError } from '../../shared/http/errors.js';
import { CHANNEL_AVATAR_BASENAME } from '../video-production/shared/si-video/si.constants.js';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const IMAGE_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

export type ChannelAvatarContentType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ChannelAvatarUpload {
  buffer: Buffer;
  contentType: ChannelAvatarContentType;
}

export interface ChannelAvatarItem {
  name: string;
  url: string;
}

export interface ChannelAvatarAsset {
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

function extensionForContentType(contentType: ChannelAvatarContentType): string {
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

function removeExistingAvatarFiles(dir: string): void {
  ensureDir(dir);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const parsed = path.parse(entry.name);
    if (parsed.name.toLowerCase() !== CHANNEL_AVATAR_BASENAME.toLowerCase()) continue;
    const ext = parsed.ext.toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;
    fs.unlinkSync(path.join(dir, entry.name));
  }
}

function writeAvatarFile(dir: string, upload: ChannelAvatarUpload): string {
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
  removeExistingAvatarFiles(dir);
  const fileName = `${CHANNEL_AVATAR_BASENAME}${extensionForContentType(upload.contentType)}`;
  const targetPath = path.join(dir, fileName);
  fs.writeFileSync(targetPath, upload.buffer);
  return fileName;
}

function resolveAvatarAsset(dir: string, filename: string): ChannelAvatarAsset {
  const safeName = sanitizeFileName(filename);
  const fullPath = path.join(dir, safeName);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    throw new AppError('Avatar not found', 404, 'NOT_FOUND');
  }
  return {
    filePath: fullPath,
    contentType: contentTypeForExtension(path.extname(safeName)),
    size: fs.statSync(fullPath).size,
  };
}

export class ChannelAvatarsService {
  async uploadForChannel(channelId: string, upload: ChannelAvatarUpload, urlPrefix: string): Promise<ChannelAvatarItem> {
    const dir = youtubeChannelDir(channelId);
    const name = writeAvatarFile(dir, upload);
    return { name, url: `${urlPrefix}/${encodeURIComponent(name)}` };
  }

  async uploadTemp(sessionId: string, upload: ChannelAvatarUpload, urlPrefix: string): Promise<ChannelAvatarItem> {
    const safeSession = sanitizeSessionId(sessionId);
    const dir = youtubeChannelAvatarTempDir(safeSession);
    const name = writeAvatarFile(dir, upload);
    return { name, url: `${urlPrefix}/${encodeURIComponent(name)}` };
  }

  getChannelAsset(channelId: string, filename: string): ChannelAvatarAsset {
    return resolveAvatarAsset(youtubeChannelDir(channelId), filename);
  }

  getTempAsset(sessionId: string, filename: string): ChannelAvatarAsset {
    return resolveAvatarAsset(youtubeChannelAvatarTempDir(sanitizeSessionId(sessionId)), filename);
  }

  moveTempToChannel(sessionId: string, channelId: string): void {
    const safeSession = sanitizeSessionId(sessionId);
    const tempDir = youtubeChannelAvatarTempDir(safeSession);
    if (!fs.existsSync(tempDir)) return;

    const entries = fs.readdirSync(tempDir, { withFileTypes: true });
    const candidate = entries.find((entry) => {
      if (!entry.isFile()) return false;
      const parsed = path.parse(entry.name);
      return parsed.name.toLowerCase() === CHANNEL_AVATAR_BASENAME.toLowerCase() && IMAGE_EXTENSIONS.has(parsed.ext.toLowerCase());
    });
    if (!candidate) return;

    const sourcePath = path.join(tempDir, candidate.name);
    const ext = path.extname(candidate.name).toLowerCase();
    const targetDir = youtubeChannelDir(channelId);
    ensureDir(targetDir);
    removeExistingAvatarFiles(targetDir);
    const targetPath = path.join(targetDir, `${CHANNEL_AVATAR_BASENAME}${ext}`);
    try {
      fs.renameSync(sourcePath, targetPath);
    } catch {
      fs.copyFileSync(sourcePath, targetPath);
      fs.unlinkSync(sourcePath);
    }
  }
}

export const channelAvatarsService = new ChannelAvatarsService();
