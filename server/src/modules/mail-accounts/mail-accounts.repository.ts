import { paths } from '../../config/paths.js';
import { readJson, updateJson, writeJson } from '../../infrastructure/storage/json-store.js';
import { ensureUuid, isUuid } from '../../shared/id.js';
import type { MailAccount, MailAccountsStore } from './mail-accounts.types.js';

const EMPTY_STORE: MailAccountsStore = { accounts: [] };

type LegacyMailAccount = MailAccount & {
  provider?: string;
  status?: string;
  linkedPlatforms?: string[];
  recoveryPhone?: string;
};

type LegacyMailAccountsStore = {
  accounts?: LegacyMailAccount[];
  nextId?: number;
};

function normalizeAccount(account: LegacyMailAccount): MailAccount {
  const { provider: _provider, status: _status, linkedPlatforms: _linkedPlatforms, recoveryPhone, ...rest } =
    account;

  return {
    id: ensureUuid(account.id),
    email: account.email,
    password: account.password,
    twoFactorAuth: account.twoFactorAuth,
    purpose: account.purpose ?? '',
    recoveryEmail: account.recoveryEmail ?? '',
    phone: account.phone ?? recoveryPhone,
    notes: account.notes ?? '',
    youtubeDeletedAt: account.youtubeDeletedAt,
  };
}

function normalizeStore(raw: LegacyMailAccountsStore | null): MailAccountsStore {
  if (!raw?.accounts) return EMPTY_STORE;

  return {
    accounts: raw.accounts.map(normalizeAccount),
  };
}

function storeNeedsPersist(raw: LegacyMailAccountsStore, normalized: MailAccountsStore): boolean {
  if (raw.nextId !== undefined) return true;
  if (!raw.accounts) return false;

  return raw.accounts.some((account, i) => {
    const normalizedAccount = normalized.accounts[i];
    if (!normalizedAccount) return true;
    if (!isUuid(account.id)) return true;
    if (account.provider !== undefined) return true;
    if (account.status !== undefined) return true;
    if (account.linkedPlatforms !== undefined) return true;
    if (account.recoveryPhone !== undefined && account.phone === undefined) return true;
    return account.id !== normalizedAccount.id;
  });
}

function loadStore(): MailAccountsStore {
  const raw = readJson<LegacyMailAccountsStore>(paths.mailAccounts);
  if (!raw) {
    writeJson(paths.mailAccounts, EMPTY_STORE);
    return EMPTY_STORE;
  }

  const normalized = normalizeStore(raw);

  if (storeNeedsPersist(raw, normalized)) {
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

  findByEmail(email: string): MailAccount | null {
    const normalized = email.trim().toLowerCase();
    return loadStore().accounts.find((a) => a.email.toLowerCase() === normalized) ?? null;
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

  update(id: string, updater: (account: MailAccount) => MailAccount): MailAccount | null {
    let updated: MailAccount | null = null;

    this.saveStore((store) => {
      const index = store.accounts.findIndex((a) => a.id === id);
      if (index === -1) return store;

      updated = updater(store.accounts[index]);
      const accounts = [...store.accounts];
      accounts[index] = updated;
      return { accounts };
    });

    return updated;
  }

  remove(id: string): boolean {
    let removed = false;

    this.saveStore((store) => {
      const index = store.accounts.findIndex((a) => a.id === id);
      if (index === -1) return store;

      removed = true;
      const accounts = [...store.accounts];
      accounts.splice(index, 1);
      return { accounts };
    });

    return removed;
  }
}

export const mailAccountsRepository = new MailAccountsRepository();
