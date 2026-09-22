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
  platformLinks: PlatformLinks;
}

export interface MailAccountsResponse {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  items: MailAccount[];
}

export interface CreateMailAccountPayload {
  email: string;
  password?: string;
  twoFactorAuth?: string;
  recoveryEmail?: string;
  phone?: string;
}

export type UpdateMailAccountPayload = CreateMailAccountPayload;

export interface AddMailFormValues {
  email: string;
  password?: string;
  twoFactorAuth?: string;
  recoveryEmail?: string;
  phone?: string;
}

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

export interface MailImportPreviewResult {
  rows: MailImportPreviewRow[];
}

export interface MailImportResult {
  created: number;
  skipped: number;
  errors: string[];
}
