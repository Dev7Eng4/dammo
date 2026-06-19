import fs from 'node:fs';
import { sourceVideosFile } from '../../config/paths.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { SourceVideosStore } from './source-channels.types.js';

export class SourceVideosRepository {
  exists(sourceId: string): boolean {
    return fs.existsSync(sourceVideosFile(sourceId));
  }

  read(sourceId: string): SourceVideosStore | null {
    return readJson<SourceVideosStore>(sourceVideosFile(sourceId));
  }

  write(sourceId: string, store: SourceVideosStore): SourceVideosStore {
    writeJson(sourceVideosFile(sourceId), store);
    return store;
  }

  delete(sourceId: string): void {
    const file = sourceVideosFile(sourceId);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
}

export const sourceVideosRepository = new SourceVideosRepository();
