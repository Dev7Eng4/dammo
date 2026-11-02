import fs from 'node:fs';
import path from 'node:path';
import {
  youtubeChannelAvatarTempDir,
  youtubeChannelDir,
  youtubeChannelMascotTempDir,
} from '../../config/paths.js';
import { AppError } from '../../shared/http/errors.js';
import { CHANNEL_MASCOT_BASENAME } from '../video-production/shared/ai-video/ai-video-channel-mascots.js';
import { CHANNEL_AVATAR_BASENAME } from '../video-production/shared/render-core/canvas.constants.js';

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

function removeExistingAvatarFiles(dir: string, basename: string): void {
  ensureDir(dir);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const parsed = path.parse(entry.name);
    if (parsed.name.toLowerCase() !== basename.toLowerCase()) continue;
    const ext = parsed.ext.toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;
    fs.unlinkSync(path.join(dir, entry.name));
  }
}

function writeAvatarFile(dir: string, upload: ChannelAvatarUpload, basename: string): string {
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
  removeExistingAvatarFiles(dir, basename);
  const fileName = `${basename}${extensionForContentType(upload.contentType)}`;
  const targetPath = path.join(dir, fileName);
  fs.writeFileSync(targetPath, upload.buffer);
  return fileName;
}

function resolveAvatarAsset(dir: string, filename: string, basename: string): ChannelAvatarAsset {
  const safeName = sanitizeFileName(filename);
  if (path.parse(safeName).name.toLowerCase() !== basename.toLowerCase()) {
    throw new AppError('Image not found', 404, 'NOT_FOUND');
  }
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

function findAvatarFileName(dir: string, basename: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const candidate = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .find((name) => {
      const parsed = path.parse(name);
      return (
        parsed.name.toLowerCase() === basename.toLowerCase() &&
        IMAGE_EXTENSIONS.has(parsed.ext.toLowerCase())
      );
    });
  return candidate ?? null;
}

/**
 * One image per channel stored as `<channel dir>/<basename>.<ext>` (avatar, mascot).
 * New channels upload into a temp session folder that is moved on create.
 */
export class ChannelAvatarsService {
  constructor(
    private readonly basename: string,
    private readonly tempDirFor: (sessionId: string) => string,
  ) {}

  findForChannel(channelId: string, urlPrefix: string): ChannelAvatarItem | null {
    const name = findAvatarFileName(youtubeChannelDir(channelId), this.basename);
    if (!name) return null;
    return { name, url: `${urlPrefix}/${encodeURIComponent(name)}` };
  }

  async uploadForChannel(channelId: string, upload: ChannelAvatarUpload, urlPrefix: string): Promise<ChannelAvatarItem> {
    const dir = youtubeChannelDir(channelId);
    const name = writeAvatarFile(dir, upload, this.basename);
    return { name, url: `${urlPrefix}/${encodeURIComponent(name)}` };
  }

  async uploadTemp(sessionId: string, upload: ChannelAvatarUpload, urlPrefix: string): Promise<ChannelAvatarItem> {
    const safeSession = sanitizeSessionId(sessionId);
    const dir = this.tempDirFor(safeSession);
    const name = writeAvatarFile(dir, upload, this.basename);
    return { name, url: `${urlPrefix}/${encodeURIComponent(name)}` };
  }

  deleteForChannel(channelId: string): void {
    removeExistingAvatarFiles(youtubeChannelDir(channelId), this.basename);
  }

  getChannelAsset(channelId: string, filename: string): ChannelAvatarAsset {
    return resolveAvatarAsset(youtubeChannelDir(channelId), filename, this.basename);
  }

  getTempAsset(sessionId: string, filename: string): ChannelAvatarAsset {
    return resolveAvatarAsset(this.tempDirFor(sanitizeSessionId(sessionId)), filename, this.basename);
  }

  moveTempToChannel(sessionId: string, channelId: string): void {
    const safeSession = sanitizeSessionId(sessionId);
    const tempDir = this.tempDirFor(safeSession);
    if (!fs.existsSync(tempDir)) return;

    const entries = fs.readdirSync(tempDir, { withFileTypes: true });
    const candidate = entries.find((entry) => {
      if (!entry.isFile()) return false;
      const parsed = path.parse(entry.name);
      return parsed.name.toLowerCase() === this.basename.toLowerCase() && IMAGE_EXTENSIONS.has(parsed.ext.toLowerCase());
    });
    if (!candidate) return;

    const sourcePath = path.join(tempDir, candidate.name);
    const ext = path.extname(candidate.name).toLowerCase();
    const targetDir = youtubeChannelDir(channelId);
    ensureDir(targetDir);
    removeExistingAvatarFiles(targetDir, this.basename);
    const targetPath = path.join(targetDir, `${this.basename}${ext}`);
    try {
      fs.renameSync(sourcePath, targetPath);
    } catch {
      fs.copyFileSync(sourcePath, targetPath);
      fs.unlinkSync(sourcePath);
    }
  }
}

export const channelAvatarsService = new ChannelAvatarsService(CHANNEL_AVATAR_BASENAME, youtubeChannelAvatarTempDir);
export const channelMascotImagesService = new ChannelAvatarsService(CHANNEL_MASCOT_BASENAME, youtubeChannelMascotTempDir);
