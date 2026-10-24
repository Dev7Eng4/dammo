import { paths } from '../../config/paths.js';
import { readJson, updateJson } from '../../infrastructure/storage/json-store.js';
import type { FacebookPage, FacebookPagesStore } from './facebook-pages.types.js';

const EMPTY_STORE: FacebookPagesStore = { pages: [] };

function loadStore(): FacebookPagesStore {
  const raw = readJson<FacebookPagesStore>(paths.facebookPages);
  if (!raw || !Array.isArray(raw.pages)) return EMPTY_STORE;
  return raw;
}

export class FacebookPagesRepository {
  findAll(): FacebookPage[] {
    return loadStore().pages.filter((page) => page.status !== 'deleted');
  }

  findById(id: string): FacebookPage | null {
    return loadStore().pages.find((page) => page.id === id && page.status !== 'deleted') ?? null;
  }

  prepend(page: FacebookPage): FacebookPage {
    updateJson(paths.facebookPages, (store) => ({ pages: [page, ...store.pages] }), loadStore());
    return page;
  }

  update(id: string, updater: (page: FacebookPage) => FacebookPage): FacebookPage | null {
    let updated: FacebookPage | null = null;
    updateJson(
      paths.facebookPages,
      (store) => {
        const index = store.pages.findIndex((page) => page.id === id);
        if (index === -1) return store;
        updated = updater(store.pages[index]);
        const pages = [...store.pages];
        pages[index] = updated;
        return { pages };
      },
      loadStore(),
    );
    return updated;
  }

  /** Soft-delete: keeps the row so the email stays traceable. */
  remove(id: string): boolean {
    return this.update(id, (page) => ({ ...page, status: 'deleted' })) != null;
  }
}

export const facebookPagesRepository = new FacebookPagesRepository();
