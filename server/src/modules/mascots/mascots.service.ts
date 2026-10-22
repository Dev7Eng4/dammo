import fs from 'node:fs';
import path from 'node:path';
import { mascotDir } from '../../config/paths.js';
import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import { mascotsRepository } from './mascots.repository.js';
import type {
  CreateMascotInput,
  Mascot,
  MascotListItem,
  UpdateMascotInput,
} from './mascots.types.js';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const IMAGE_BASENAME = 'image';

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function contentTypeFor(fileName: string): string {
  switch (path.extname(fileName).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

function toListItem(mascot: Mascot): MascotListItem {
  const hasImage =
    Boolean(mascot.imageFile) && fs.existsSync(path.join(mascotDir(mascot.id), mascot.imageFile!));
  return { ...mascot, hasImage };
}

export class MascotsService {
  list(): MascotListItem[] {
    return mascotsRepository.findAll().map(toListItem);
  }

  getById(id: string): Mascot {
    const mascot = mascotsRepository.findById(id);
    if (!mascot) throw new AppError('Mascot not found', 404, 'NOT_FOUND');
    return mascot;
  }

  /** Throws when the id does not exist or has no image, so a channel never points at an unusable mascot. */
  assertUsable(id: string): void {
    const mascot = this.getById(id);
    if (!toListItem(mascot).hasImage) {
      throw new AppError('Mascot has no reference image yet', 400, 'MASCOT_NO_IMAGE');
    }
  }

  create(input: CreateMascotInput): MascotListItem {
    const now = new Date().toISOString();
    const mascot: Mascot = {
      id: generateId(),
      name: input.name.trim(),
      prompt: input.prompt.trim(),
      createdAt: now,
      updatedAt: now,
    };
    mascotsRepository.prepend(mascot);
    ensureDir(mascotDir(mascot.id));
    return toListItem(mascot);
  }

  update(id: string, input: UpdateMascotInput): MascotListItem {
    this.getById(id);
    const updated = mascotsRepository.update(id, (mascot) => ({
      ...mascot,
      name: input.name?.trim() ?? mascot.name,
      prompt: input.prompt?.trim() ?? mascot.prompt,
      updatedAt: new Date().toISOString(),
    }));
    if (!updated) throw new AppError('Mascot not found', 404, 'NOT_FOUND');
    return toListItem(updated);
  }

  delete(id: string): void {
    if (!mascotsRepository.remove(id)) {
      throw new AppError('Mascot not found', 404, 'NOT_FOUND');
    }
    fs.rmSync(mascotDir(id), { recursive: true, force: true });
  }

  /** Replace the mascot's reference image (one image per mascot). */
  async uploadImage(id: string, file: File): Promise<MascotListItem> {
    this.getById(id);
    if (!(file instanceof File) || file.size === 0) {
      throw new AppError('File is required', 400, 'FILE_REQUIRED');
    }
    const ext = path.extname(path.basename(file.name)).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      throw new AppError(`Unsupported file type: ${ext || '(none)'}`, 400, 'UNSUPPORTED_FILE_TYPE');
    }

    const dir = mascotDir(id);
    ensureDir(dir);
    for (const entry of fs.readdirSync(dir)) {
      if (path.basename(entry, path.extname(entry)) === IMAGE_BASENAME) {
        fs.rmSync(path.join(dir, entry), { force: true });
      }
    }
    const imageFile = `${IMAGE_BASENAME}${ext}`;
    fs.writeFileSync(path.join(dir, imageFile), Buffer.from(await file.arrayBuffer()));

    const updated = mascotsRepository.update(id, (mascot) => ({
      ...mascot,
      imageFile,
      updatedAt: new Date().toISOString(),
    }));
    if (!updated) throw new AppError('Mascot not found', 404, 'NOT_FOUND');
    return toListItem(updated);
  }

  deleteImage(id: string): MascotListItem {
    const mascot = this.getById(id);
    if (mascot.imageFile) {
      fs.rmSync(path.join(mascotDir(id), mascot.imageFile), { force: true });
    }
    const updated = mascotsRepository.update(id, (item) => {
      const { imageFile: _removed, ...rest } = item;
      return { ...rest, updatedAt: new Date().toISOString() };
    });
    if (!updated) throw new AppError('Mascot not found', 404, 'NOT_FOUND');
    return toListItem(updated);
  }

  getImageFile(id: string): { filePath: string; contentType: string; size: number } {
    const mascot = this.getById(id);
    if (!mascot.imageFile) throw new AppError('Mascot image not found', 404, 'NOT_FOUND');
    const filePath = path.join(mascotDir(id), mascot.imageFile);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new AppError('Mascot image not found', 404, 'NOT_FOUND');
    }
    return {
      filePath,
      contentType: contentTypeFor(mascot.imageFile),
      size: fs.statSync(filePath).size,
    };
  }
}

export const mascotsService = new MascotsService();
