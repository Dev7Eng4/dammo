import fs from 'node:fs';
import path from 'node:path';
import { celebrityDir, paths } from '../../config/paths.js';
import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import { celebritiesRepository } from './celebrities.repository.js';
import type {
  Celebrity,
  CelebrityListItem,
  CelebrityMediaItem,
  CelebrityMediaKind,
  CreateCelebrityInput,
  UpdateCelebrityInput,
} from './celebrities.types.js';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov']);
const ALLOWED_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]);

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
  return base;
}

function mediaKindFromExt(ext: string): CelebrityMediaKind | null {
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return null;
}

function assertAllowedMedia(fileName: string): CelebrityMediaKind {
  const ext = path.extname(fileName).toLowerCase();
  const kind = mediaKindFromExt(ext);
  if (!kind) {
    throw new AppError(
      `Unsupported file type: ${ext || '(none)'}`,
      400,
      'UNSUPPORTED_FILE_TYPE',
    );
  }
  return kind;
}

function sanitizeCelebrityNameForFile(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.+|\.+$/g, '');
  return cleaned || 'celebrity';
}

/** Build `{celebrityName}_{image|video}_{n}{ext}` using next free sequence for that kind. */
function nextMediaFileName(
  dir: string,
  celebrityName: string,
  kind: CelebrityMediaKind,
  ext: string,
): string {
  const base = sanitizeCelebrityNameForFile(celebrityName);
  const prefix = `${base}_${kind}_`;
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

function countMedia(celebrityId: string): number {
  const dir = celebrityDir(celebrityId);
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => {
    if (!entry.isFile()) return false;
    return ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase());
  }).length;
}

function removeDirRecursive(dir: string): void {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function contentTypeFor(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.mov':
      return 'video/quicktime';
    default:
      return 'video/mp4';
  }
}

export class CelebritiesService {
  list(): CelebrityListItem[] {
    ensureDir(paths.celebritiesDir);
    return celebritiesRepository.findAll().map((item) => ({
      ...item,
      mediaCount: countMedia(item.id),
    }));
  }

  getById(id: string): Celebrity {
    const celebrity = celebritiesRepository.findById(id);
    if (!celebrity) {
      throw new AppError('Celebrity not found', 404, 'NOT_FOUND');
    }
    return celebrity;
  }

  create(input: CreateCelebrityInput): CelebrityListItem {
    const now = new Date().toISOString();
    const celebrity: Celebrity = {
      id: generateId(),
      name: input.name.trim(),
      note: input.note?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    celebritiesRepository.prepend(celebrity);
    ensureDir(celebrityDir(celebrity.id));
    return { ...celebrity, mediaCount: 0 };
  }

  update(id: string, input: UpdateCelebrityInput): CelebrityListItem {
    this.getById(id);
    const now = new Date().toISOString();

    const updated = celebritiesRepository.update(id, (celebrity) => {
      const next: Celebrity = {
        ...celebrity,
        name: input.name?.trim() ?? celebrity.name,
        updatedAt: now,
      };
      if (input.note !== undefined) {
        next.note = input.note?.trim() || undefined;
      }
      return next;
    });

    if (!updated) {
      throw new AppError('Celebrity not found', 404, 'NOT_FOUND');
    }

    return { ...updated, mediaCount: countMedia(id) };
  }

  delete(id: string): void {
    const removed = celebritiesRepository.remove(id);
    if (!removed) {
      throw new AppError('Celebrity not found', 404, 'NOT_FOUND');
    }
    removeDirRecursive(celebrityDir(id));
  }

  listMedia(id: string): CelebrityMediaItem[] {
    this.getById(id);
    const dir = celebrityDir(id);
    ensureDir(dir);

    const items: CelebrityMediaItem[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      const kind = mediaKindFromExt(ext);
      if (!kind) continue;

      const fullPath = path.join(dir, entry.name);
      const stat = fs.statSync(fullPath);
      items.push({
        name: entry.name,
        kind,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
    }

    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  async uploadMedia(id: string, file: File): Promise<CelebrityMediaItem> {
    const celebrity = this.getById(id);
    if (!(file instanceof File) || file.size === 0) {
      throw new AppError('File is required', 400, 'FILE_REQUIRED');
    }

    const originalName = sanitizeFileName(file.name);
    const kind = assertAllowedMedia(originalName);
    const ext = path.extname(originalName).toLowerCase();

    const dir = celebrityDir(id);
    ensureDir(dir);

    const fileName = nextMediaFileName(dir, celebrity.name, kind, ext);
    const destPath = path.join(dir, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(destPath, buffer);

    const stat = fs.statSync(destPath);
    celebritiesRepository.update(id, (item) => ({
      ...item,
      updatedAt: new Date().toISOString(),
    }));

    return {
      name: fileName,
      kind,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
    };
  }

  deleteMedia(id: string, names: string[]): { deleted: string[] } {
    this.getById(id);
    const dir = celebrityDir(id);
    ensureDir(dir);

    const deleted: string[] = [];
    for (const rawName of names) {
      const safeName = sanitizeFileName(rawName);
      assertAllowedMedia(safeName);

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

    celebritiesRepository.update(id, (celebrity) => ({
      ...celebrity,
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
    assertAllowedMedia(safeName);

    const dir = celebrityDir(id);
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

export const celebritiesService = new CelebritiesService();
