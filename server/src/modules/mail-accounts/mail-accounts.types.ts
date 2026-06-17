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

export interface MailAccountsStore {
  accounts: MailAccount[];
}

export interface CreateMailAccountInput {
  email: string;
  password?: string;
  recoveryEmail?: string;
}
