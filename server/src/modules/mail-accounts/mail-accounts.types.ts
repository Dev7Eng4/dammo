export interface PlatformLinks {
  youtube: boolean;
  tiktok: boolean;
  facebook: boolean;
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
