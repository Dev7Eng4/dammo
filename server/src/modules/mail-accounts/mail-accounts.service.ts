import { z } from 'zod';
import { createGpmProfile } from '../../infrastructure/gpm/gpm-api.client.js';
import {
  connectPlaywrightToGpmProfile,
  detachGpmPlaywright,
  type GpmPlaywrightConnection,
} from '../../infrastructure/gpm/gpm-playwright.connector.js';
import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import { paginate } from '../../shared/types/pagination.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import { runGmailLogin } from './gmail-login/gmail-login.flow.js';
import { createMailAccountSchema } from './mail-accounts.schema.js';
import { mailAccountsRepository } from './mail-accounts.repository.js';
import type {
  CreateMailAccountInput,
  MailAccount,
  MailAccountView,
  MailImportPreviewRow,
  MailImportResult,
  PlatformLinks,
  UpdateMailAccountInput,
} from './mail-accounts.types.js';

export interface GmailLoginResult {
  ok: true;
  email: string;
  gpmProfileId: string;
}

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

const TWO_FA_PATTERN = /^([a-zA-Z0-9]{4}\s+){7}[a-zA-Z0-9]{4}$/;
const EMAIL_LIKE = z.string().email();

function normalizeTwoFa(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function parseTextLine(
  line: string,
): { input: CreateMailAccountInput } | { error: string; input: CreateMailAccountInput } {
  const parts = line.split('\t').map((part) => part.trim());
  const email = (parts[0] ?? '').toLowerCase();
  const password = parts[1] ?? '';
  const third = parts[2] ?? '';

  const input: CreateMailAccountInput = {
    email,
    password: password || undefined,
  };

  if (!third) {
    return { input };
  }

  if (third.includes('@')) {
    const emailCheck = EMAIL_LIKE.safeParse(third);
    if (!emailCheck.success) {
      return { input: { ...input, recoveryEmail: third }, error: 'Invalid recovery email' };
    }
    return { input: { ...input, recoveryEmail: third.toLowerCase() } };
  }

  const normalizedTwoFa = normalizeTwoFa(third);
  if (TWO_FA_PATTERN.test(normalizedTwoFa)) {
    return { input: { ...input, twoFactorAuth: normalizedTwoFa } };
  }

  return {
    input: { ...input },
    error: 'Third column must be 2FA (8 groups of 4) or recovery email',
  };
}

function toPreviewRow(
  rowIndex: number,
  input: CreateMailAccountInput,
  extra?: { valid?: boolean; error?: string },
): MailImportPreviewRow {
  return {
    rowIndex,
    email: input.email.trim().toLowerCase(),
    password: input.password?.trim() ?? '',
    twoFactorAuth: input.twoFactorAuth?.trim() ?? '',
    recoveryEmail: input.recoveryEmail?.trim() ?? '',
    phone: input.phone?.trim() ?? '',
    valid: extra?.valid ?? false,
    error: extra?.error,
  };
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

  previewImportFromText(text: string): { rows: MailImportPreviewRow[] } {
    const existingEmails = new Set(
      mailAccountsRepository.findAll().map((account) => account.email.toLowerCase()),
    );
    const seenInFile = new Set<string>();
    const preview: MailImportPreviewRow[] = [];
    const lines = text.split(/\r?\n/);

    for (const [lineIndex, rawLine] of lines.entries()) {
      const line = rawLine.trim();
      if (!line) continue;

      const rowIndex = lineIndex + 1;
      const parsedLine = parseTextLine(line);

      if ('error' in parsedLine && parsedLine.error) {
        preview.push(toPreviewRow(rowIndex, parsedLine.input, { error: parsedLine.error }));
        continue;
      }

      const mapped = parsedLine.input;
      const email = mapped.email.trim().toLowerCase();
      const base = toPreviewRow(rowIndex, mapped);

      if (!email) {
        preview.push({ ...base, error: 'Email is required' });
        continue;
      }

      const parsed = createMailAccountSchema.safeParse({
        email,
        password: mapped.password || undefined,
        twoFactorAuth: mapped.twoFactorAuth || undefined,
        recoveryEmail: mapped.recoveryEmail || undefined,
        phone: mapped.phone || undefined,
      });

      if (!parsed.success) {
        const first = parsed.error.issues[0];
        preview.push({
          ...base,
          error: first?.message ?? 'Invalid row',
        });
        continue;
      }

      if (seenInFile.has(email)) {
        preview.push({ ...base, error: 'Duplicate email in paste' });
        continue;
      }

      if (existingEmails.has(email)) {
        preview.push({ ...base, error: 'Email already exists' });
        continue;
      }

      seenInFile.add(email);
      preview.push({ ...base, valid: true });
    }

    return { rows: preview };
  }

  importRows(inputs: CreateMailAccountInput[]): MailImportResult {
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [index, input] of inputs.entries()) {
      try {
        this.create(input);
        created += 1;
      } catch (err) {
        skipped += 1;
        errors.push(
          `Row ${index + 1}: ${err instanceof Error ? err.message : 'Failed to import'}`,
        );
      }
    }

    return { created, skipped, errors };
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

  async loginGmail(id: string): Promise<GmailLoginResult> {
    const account = mailAccountsRepository.findById(id);
    if (!account) {
      throw new AppError('Account not found', 404, 'NOT_FOUND');
    }

    const email = account.email.trim();
    const password = account.password?.trim();
    if (!email) {
      throw new AppError('Email is required', 400, 'MISSING_EMAIL');
    }
    if (!password) {
      throw new AppError('Password is required for Gmail login', 400, 'MISSING_PASSWORD');
    }

    const profile = await createGpmProfile({
      name: email,
      raw_proxy: '',
    });
    const gpmProfileId = profile.id;
    let connection: GpmPlaywrightConnection | undefined;

    try {
      connection = await connectPlaywrightToGpmProfile(gpmProfileId, { foreground: true });
      await runGmailLogin(connection.page, connection.context, { email, password });
      console.log(`[mail-accounts] Gmail login ok for ${email} (GPM ${gpmProfileId})`);
      return { ok: true, email, gpmProfileId };
    } finally {
      if (connection) {
        // Detach CDP only — leave the GPM profile running so the session persists.
        await detachGpmPlaywright(connection);
      }
    }
  }
}

export const mailAccountsService = new MailAccountsService();
