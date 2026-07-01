import { Buffer } from 'node:buffer';
import { jsonToExcelBuffer } from '../../infrastructure/storage/excel-store.js';
import { mailAccountsService } from './mail-accounts.service.js';
import type { MailAccountView } from './mail-accounts.types.js';

const COLUMN_WIDTHS = [
  { wch: 32 },
  { wch: 16 },
  { wch: 16 },
  { wch: 28 },
  { wch: 16 },
  { wch: 12 },
  { wch: 12 },
  { wch: 12 },
  { wch: 20 },
];

function platformLabel(linked: boolean): string {
  return linked ? 'Active' : '';
}

function accountToRow(account: MailAccountView) {
  return {
    Email: account.email,
    Password: account.password ?? '',
    '2FA': account.twoFactorAuth ?? '',
    'Recovery email': account.recoveryEmail,
    Phone: account.phone ?? '',
    Youtube: platformLabel(account.platformLinks.youtube),
    TikTok: platformLabel(account.platformLinks.tiktok),
    Facebook: platformLabel(account.platformLinks.facebook),
    Purpose: account.purpose,
  };
}

export function buildMailAccountsExcel(query?: string, ids?: string[]): Buffer {
  const accounts = mailAccountsService.getForExport(query, ids);
  const rows = accounts.map(accountToRow);
  return jsonToExcelBuffer(rows, 'Mail Accounts', COLUMN_WIDTHS);
}

export function buildExportFilename(ids?: string[]): string {
  const date = new Date().toISOString().slice(0, 10);
  if (ids && ids.length > 0) {
    return `mail-accounts-selected-${date}.xlsx`;
  }
  return `mail-accounts-${date}.xlsx`;
}
