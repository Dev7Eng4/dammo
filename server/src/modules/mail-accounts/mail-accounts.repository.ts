import { paths } from '../../config/paths.js';
import { readJson, updateJson, writeJson } from '../../infrastructure/storage/json-store.js';
import { ensureUuid, isUuid } from '../../shared/id.js';
import { generateSeedAccounts } from './mail-accounts.seed.js';
import type { MailAccount, MailAccountsStore } from './mail-accounts.types.js';

const EMPTY_STORE: MailAccountsStore = { accounts: [] };

type LegacyMailAccountsStore = MailAccountsStore & { nextId?: number };

function normalizeStore(raw: LegacyMailAccountsStore | null): MailAccountsStore {
  if (!raw?.accounts) return EMPTY_STORE;

  const needsMigration =
    raw.nextId !== undefined || raw.accounts.some((account) => !isUuid(account.id));

  if (!needsMigration) {
    return { accounts: raw.accounts };
  }

  return {
    accounts: raw.accounts.map((account) => ({
      ...account,
      id: ensureUuid(account.id),
    })),
  };
}

function loadStore(): MailAccountsStore {
  const raw = readJson<LegacyMailAccountsStore>(paths.mailAccounts);
  if (!raw) {
    const seeded = generateSeedAccounts();
    writeJson(paths.mailAccounts, seeded);
    return seeded;
  }

  const normalized = normalizeStore(raw);
  const needsPersist =
    raw.nextId !== undefined || raw.accounts.some((account, i) => account.id !== normalized.accounts[i]?.id);

  if (needsPersist) {
    writeJson(paths.mailAccounts, normalized);
  }

  return normalized;
}

export class MailAccountsRepository {
  findAll(): MailAccount[] {
    return loadStore().accounts;
  }

  findById(id: string): MailAccount | null {
    return loadStore().accounts.find((a) => a.id === id) ?? null;
  }

  saveStore(updater: (store: MailAccountsStore) => MailAccountsStore): MailAccountsStore {
    return updateJson(paths.mailAccounts, updater, loadStore());
  }

  prepend(account: MailAccount): MailAccount {
    this.saveStore((store) => ({
      accounts: [account, ...store.accounts],
    }));
    return account;
  }
}

export const mailAccountsRepository = new MailAccountsRepository();
