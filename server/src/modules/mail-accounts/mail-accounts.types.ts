export type PlatformLinkStatus = 'none' | 'active' | 'deleted';

export interface PlatformLinks {
  youtube: PlatformLinkStatus;
  tiktok: PlatformLinkStatus;
  facebook: PlatformLinkStatus;
}

export interface MailAccount {
  id: string;
  email: string;
  password?: string;
  twoFactorAuth?: string;
  purpose: string;
  recoveryEmail: string;
  phone?: string;
  notes?: string;
  youtubeDeletedAt?: string;
}

export interface MailAccountView extends MailAccount {
  platformLinks: PlatformLinks;
}

export interface MailAccountsStore {
  accounts: MailAccount[];
}

export interface CreateMailAccountInput {
  email: string;
  password?: string;
  twoFactorAuth?: string;
  recoveryEmail?: string;
  phone?: string;
}

export type UpdateMailAccountInput = CreateMailAccountInput;

export interface MailImportPreviewRow {
  rowIndex: number;
  email: string;
  password: string;
  twoFactorAuth: string;
  recoveryEmail: string;
  phone: string;
  valid: boolean;
  error?: string;
}

export interface MailImportResult {
  created: number;
  skipped: number;
  errors: string[];
}
