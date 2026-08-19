import fs from 'node:fs';
import path from 'node:path';
import { paths, smallVideoGroupDir } from '../../config/paths.js';
import { AppError } from '../../shared/http/errors.js';
import { generateId, isUuid } from '../../shared/id.js';
import { smallVideoGroupsRepository } from './small-video-groups.repository.js';
import type {
  CreateSmallVideoGroupInput,
  SmallVideoGroup,
  SmallVideoGroupListItem,
  SmallVideoGroupMediaItem,
} from './small-video-groups.types.js';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov']);

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function assertGroupId(id: string): string {
  if (!isUuid(id)) {
    throw new AppError('Invalid group id', 400, 'INVALID_ID');
  }
  return id;
}

function sanitizeFileName(name: string): string {
  const base = path.basename(name).trim();
  if (!base || base === '.' || base === '..' || base.includes('/') || base.includes('\\')) {
    throw new AppError('Invalid file name', 400, 'INVALID_FILE_NAME');
  }
  return base;
}

function assertAllowedVideo(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(ext)) {
    throw new AppError(
      `Unsupported file type: ${ext || '(none)'}`,
      400,
      'UNSUPPORTED_FILE_TYPE',
    );
  }
  return ext;
}

function sanitizeGroupNameForFile(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.+|\.+$/g, '');
  return cleaned || 'group';
}

/** Build `{groupName}_video_{n}{ext}` using next free sequence. */
function nextMediaFileName(dir: string, groupName: string, ext: string): string {
  const base = sanitizeGroupNameForFile(groupName);
  const prefix = `${base}_video_`;
  let max = 0;

  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const entryExt = path.extname(entry.name);
      const stem = path.basename(entry.name, entryExt);
      if (!stem.startsWith(prefix)) continue;
      const seq = Number(stem.slice(prefix.length));
      if (Number.isInteger(seq) && seq > max) max = seq;
    }
  }

  return `${prefix}${max + 1}${ext.toLowerCase()}`;
}

function countMedia(groupId: string): number {
  const dir = smallVideoGroupDir(groupId);
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => {
    if (!entry.isFile()) return false;
    return VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase());
  }).length;
}

function removeDirRecursive(dir: string): void {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function contentTypeFor(fileName: string): string {
  return path.extname(fileName).toLowerCase() === '.mov' ? 'video/quicktime' : 'video/mp4';
}

export class SmallVideoGroupsService {
  list(): SmallVideoGroupListItem[] {
    ensureDir(paths.siSmallVideoDir);
    return smallVideoGroupsRepository.findAll().map((item) => ({
      ...item,
      mediaCount: countMedia(item.id),
    }));
  }

  getById(id: string): SmallVideoGroup {
    const group = smallVideoGroupsRepository.findById(assertGroupId(id));
    if (!group) {
      throw new AppError('Small video group not found', 404, 'NOT_FOUND');
    }
    return group;
  }

  create(input: CreateSmallVideoGroupInput): SmallVideoGroupListItem {
    const now = new Date().toISOString();
    const group: SmallVideoGroup = {
      id: generateId(),
      name: input.name.trim(),
      note: input.note?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    smallVideoGroupsRepository.prepend(group);
    ensureDir(smallVideoGroupDir(group.id));
    return { ...group, mediaCount: 0 };
  }

  delete(id: string): void {
    const safeId = assertGroupId(id);
    const removed = smallVideoGroupsRepository.remove(safeId);
    if (!removed) {
      throw new AppError('Small video group not found', 404, 'NOT_FOUND');
    }
    removeDirRecursive(smallVideoGroupDir(safeId));
  }

  listMedia(id: string): SmallVideoGroupMediaItem[] {
    this.getById(id);
    const dir = smallVideoGroupDir(id);
    ensureDir(dir);

    const items: SmallVideoGroupMediaItem[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!VIDEO_EXTENSIONS.has(ext)) continue;

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

  async uploadMedia(id: string, file: File): Promise<SmallVideoGroupMediaItem> {
    const group = this.getById(id);
    if (!(file instanceof File) || file.size === 0) {
      throw new AppError('File is required', 400, 'FILE_REQUIRED');
    }

    const originalName = sanitizeFileName(file.name);
    const ext = assertAllowedVideo(originalName);

    const dir = smallVideoGroupDir(id);
    ensureDir(dir);

    const fileName = nextMediaFileName(dir, group.name, ext);
    const destPath = path.join(dir, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(destPath, buffer);

    const stat = fs.statSync(destPath);
    smallVideoGroupsRepository.update(id, (item) => ({
      ...item,
      updatedAt: new Date().toISOString(),
    }));

    return {
      name: fileName,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
    };
  }

  deleteMedia(id: string, names: string[]): { deleted: string[] } {
    this.getById(id);
    const dir = smallVideoGroupDir(id);
    ensureDir(dir);

    const deleted: string[] = [];
    for (const rawName of names) {
      const safeName = sanitizeFileName(rawName);
      assertAllowedVideo(safeName);

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

    smallVideoGroupsRepository.update(id, (group) => ({
      ...group,
      updatedAt: new Date().toISOString(),
    }));

    return { deleted };
  }

  getMediaFile(
    id: string,
    filename: string,
  ): { filePath: string; contentType: string; size: number } {
    this.getById(id);
    const safeName = sanitizeFileName(filename);
    assertAllowedVideo(safeName);

    const dir = smallVideoGroupDir(id);
    const filePath = path.join(dir, safeName);
    if (!filePath.startsWith(dir + path.sep) && filePath !== dir) {
      throw new AppError('Invalid file path', 400, 'INVALID_FILE_PATH');
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new AppError('Media not found', 404, 'NOT_FOUND');
    }

    return {
      filePath,
      contentType: contentTypeFor(safeName),
      size: fs.statSync(filePath).size,
    };
  }
}

export const smallVideoGroupsService = new SmallVideoGroupsService();
