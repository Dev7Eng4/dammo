import { Buffer } from 'node:buffer';
import { jsonToExcelBuffer } from '../../infrastructure/storage/excel-store.js';
import { mailAccountsService } from './mail-accounts.service.js';
import type { MailAccount, MailAccountStatus } from './mail-accounts.types.js';

const STATUS_LABELS: Record<MailAccount['status'], string> = {
  active: 'Active',
  need_verify: 'Need Verify',
  suspended: 'Suspended',
};

const COLUMN_WIDTHS = [
  { wch: 32 },
  { wch: 12 },
  { wch: 14 },
  { wch: 20 },
  { wch: 18 },
  { wch: 28 },
  { wch: 18 },
  { wch: 40 },
];

function accountToRow(account: MailAccount) {
  return {
    'Email Address': account.email,
    Provider: account.provider,
    Status: STATUS_LABELS[account.status],
    Purpose: account.purpose,
    'Linked Platforms': account.linkedPlatforms.join(', '),
    'Recovery Email': account.recoveryEmail,
    'Recovery Phone': account.recoveryPhone ?? '',
    Notes: account.notes ?? '',
  };
}

export function buildMailAccountsExcel(
  status?: MailAccountStatus,
  query?: string,
  ids?: string[],
): Buffer {
  const accounts = mailAccountsService.getForExport(status, query, ids);
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
