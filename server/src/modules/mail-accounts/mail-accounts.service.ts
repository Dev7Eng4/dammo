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
} from './mail-accounts.types.js';

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getPlatformLinks(email: string): PlatformLinks {
  const normalized = email.toLowerCase();
  const youtube = youtubeChannelsRepository.findAll().some((channel) => {
    const linked = channel.linkedEmail?.trim().toLowerCase();
    return linked && linked !== 'default' && linked === normalized;
  });

  return {
    youtube,
    tiktok: false,
    facebook: false,
  };
}

function toMailAccountView(account: MailAccount): MailAccountView {
  return {
    ...account,
    platformLinks: getPlatformLinks(account.email),
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
}

export const mailAccountsService = new MailAccountsService();
