import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import { paginate } from '../../shared/types/pagination.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import { mailAccountsRepository } from './mail-accounts.repository.js';
import type {
  CreateMailAccountInput,
  MailAccount,
  MailAccountView,
  PlatformLinks,
  UpdateMailAccountInput,
} from './mail-accounts.types.js';

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getPlatformLinks(account: MailAccount): PlatformLinks {
  const normalized = account.email.toLowerCase();
  const hasLiveYoutubeChannel = youtubeChannelsRepository.findAll().some((channel) => {
    const linked = channel.linkedEmail?.trim().toLowerCase();
    return linked && linked !== 'default' && linked === normalized;
  });

  const youtube: PlatformLinks['youtube'] = hasLiveYoutubeChannel
    ? 'active'
    : account.youtubeDeletedAt
      ? 'deleted'
      : 'none';

  return {
    youtube,
    tiktok: 'none',
    facebook: 'none',
  };
}

function toMailAccountView(account: MailAccount): MailAccountView {
  return {
    ...account,
    platformLinks: getPlatformLinks(account),
  };
}

function filterAccounts(accounts: MailAccount[], query?: string): MailAccount[] {
  if (!query) return accounts;

  const q = query.toLowerCase();
  return accounts.filter(
    (a) =>
      a.email.toLowerCase().includes(q) ||
      a.purpose.toLowerCase().includes(q) ||
      (a.recoveryEmail ?? '').toLowerCase().includes(q) ||
      (a.phone ?? '').toLowerCase().includes(q),
  );
}

export class MailAccountsService {
  listPaginated(query: string | undefined, page: number, limit: number) {
    const filtered = filterAccounts(mailAccountsRepository.findAll(), query);
    const paginated = paginate(filtered, page, limit);
    return {
      ...paginated,
      items: paginated.items.map(toMailAccountView),
    };
  }

  getById(id: string): MailAccountView {
    const account = mailAccountsRepository.findById(id);
    if (!account) {
      throw new AppError('Account not found', 404, 'NOT_FOUND');
    }
    return toMailAccountView(account);
  }

  getForExport(query: string | undefined, ids?: string[]): MailAccountView[] {
    if (ids && ids.length > 0) {
      return ids
        .map((id) => mailAccountsRepository.findById(id))
        .filter((account): account is MailAccount => account !== null)
        .map(toMailAccountView);
    }
    return filterAccounts(mailAccountsRepository.findAll(), query).map(toMailAccountView);
  }

  create(input: CreateMailAccountInput): MailAccountView {
    const email = input.email.trim().toLowerCase();
    const recoveryEmail = (input.recoveryEmail ?? '').trim();

    if (!email) {
      throw new AppError('Email is required');
    }

    const exists = mailAccountsRepository.findAll().some((a) => a.email.toLowerCase() === email);
    if (exists) {
      throw new AppError('Email already exists', 400, 'DUPLICATE_EMAIL');
    }

    const account: MailAccount = {
      id: generateId(),
      email,
      password: normalizeOptionalString(input.password),
      twoFactorAuth: normalizeOptionalString(input.twoFactorAuth),
      purpose: '',
      recoveryEmail,
      phone: normalizeOptionalString(input.phone),
      notes: '',
    };

    const created = mailAccountsRepository.prepend(account);
    return toMailAccountView(created);
  }

  update(id: string, input: UpdateMailAccountInput): MailAccountView {
    const current = mailAccountsRepository.findById(id);
    if (!current) {
      throw new AppError('Account not found', 404, 'NOT_FOUND');
    }

    const email = input.email.trim().toLowerCase();
    const recoveryEmail = (input.recoveryEmail ?? '').trim();

    if (!email) {
      throw new AppError('Email is required');
    }

    const duplicate = mailAccountsRepository
      .findAll()
      .some((a) => a.id !== id && a.email.toLowerCase() === email);
    if (duplicate) {
      throw new AppError('Email already exists', 400, 'DUPLICATE_EMAIL');
    }

    const updated = mailAccountsRepository.update(id, (account) => ({
      ...account,
      email,
      password: normalizeOptionalString(input.password),
      twoFactorAuth: normalizeOptionalString(input.twoFactorAuth),
      recoveryEmail,
      phone: normalizeOptionalString(input.phone),
    }));

    if (!updated) {
      throw new AppError('Account not found', 404, 'NOT_FOUND');
    }

    return toMailAccountView(updated);
  }

  delete(id: string): void {
    const removed = mailAccountsRepository.remove(id);
    if (!removed) {
      throw new AppError('Account not found', 404, 'NOT_FOUND');
    }
  }

  markYoutubeDeleted(email: string): void {
    const normalized = email.trim().toLowerCase();
    if (!normalized || normalized === 'default') return;

    const account = mailAccountsRepository.findByEmail(normalized);
    if (!account || account.youtubeDeletedAt) return;

    mailAccountsRepository.update(account.id, (current) => ({
      ...current,
      youtubeDeletedAt: new Date().toISOString(),
    }));
  }

  isYoutubeDeleted(email: string): boolean {
    const account = mailAccountsRepository.findByEmail(email);
    return Boolean(account?.youtubeDeletedAt);
  }
}

export const mailAccountsService = new MailAccountsService();
