import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import { paginate } from '../../shared/types/pagination.js';
import { mailAccountsRepository } from './mail-accounts.repository.js';
import type {
  CreateMailAccountInput,
  MailAccount,
  MailAccountStatus,
  MailProvider,
} from './mail-accounts.types.js';

function inferProvider(email: string): MailProvider {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  if (domain.includes('gmail')) return 'Gmail';
  if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live.')) return 'Outlook';
  if (domain.includes('yahoo')) return 'Yahoo';
  if (domain.includes('proton')) return 'Proton';
  if (domain.includes('icloud') || domain.includes('me.com')) return 'iCloud';
  return 'Gmail';
}

function filterAccounts(
  accounts: MailAccount[],
  status?: MailAccountStatus,
  query?: string,
): MailAccount[] {
  let results = accounts;

  if (status) {
    results = results.filter((a) => a.status === status);
  }

  if (query) {
    const q = query.toLowerCase();
    results = results.filter(
      (a) =>
        a.email.toLowerCase().includes(q) ||
        a.purpose.toLowerCase().includes(q) ||
        a.provider.toLowerCase().includes(q),
    );
  }

  return results;
}

export class MailAccountsService {
  listPaginated(
    status: MailAccountStatus | undefined,
    query: string | undefined,
    page: number,
    limit: number,
  ) {
    const filtered = filterAccounts(mailAccountsRepository.findAll(), status, query);
    return paginate(filtered, page, limit);
  }

  getById(id: string): MailAccount {
    const account = mailAccountsRepository.findById(id);
    if (!account) {
      throw new AppError('Account not found', 404, 'NOT_FOUND');
    }
    return account;
  }

  getForExport(status: MailAccountStatus | undefined, query: string | undefined, ids?: string[]) {
    if (ids && ids.length > 0) {
      return ids
        .map((id) => mailAccountsRepository.findById(id))
        .filter((account): account is MailAccount => account !== null);
    }
    return filterAccounts(mailAccountsRepository.findAll(), status, query);
  }

  create(input: CreateMailAccountInput): MailAccount {
    const email = input.email.trim().toLowerCase();
    const recoveryEmail = input.recoveryEmail.trim();

    if (!email || !recoveryEmail || !input.password) {
      throw new AppError('Email, password, and recovery email are required');
    }

    const exists = mailAccountsRepository.findAll().some((a) => a.email.toLowerCase() === email);
    if (exists) {
      throw new AppError('Email already exists', 400, 'DUPLICATE_EMAIL');
    }

    const account: MailAccount = {
      id: generateId(),
      email,
      provider: inferProvider(email),
      status: 'active',
      purpose: '',
      linkedPlatforms: [],
      recoveryEmail,
      notes: '',
    };

    return mailAccountsRepository.prepend(account);
  }
}

export const mailAccountsService = new MailAccountsService();
