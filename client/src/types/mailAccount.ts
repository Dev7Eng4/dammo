export type MailAccountStatus = 'active' | 'need_verify' | 'suspended';
export type MailProvider = 'Gmail' | 'Outlook' | 'Yahoo' | 'Proton' | 'iCloud';
export type LinkedPlatform = 'youtube' | 'tiktok' | 'facebook' | 'web';

export interface MailAccount {
  id: string;
  email: string;
  provider: MailProvider;
  status: MailAccountStatus;
  purpose: string;
  linkedPlatforms: LinkedPlatform[];
  recoveryEmail: string;
  recoveryPhone?: string;
  notes?: string;
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
  recoveryEmail?: string;
}

export type MailAccountFilter = 'all' | MailAccountStatus;

export interface AddMailFormValues {
  email: string;
  password?: string;
  recoveryEmail?: string;
}
