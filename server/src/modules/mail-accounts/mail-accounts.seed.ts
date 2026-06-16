import { generateId } from '../../shared/id.js';
import type { MailAccount, MailAccountsStore, MailProvider } from './mail-accounts.types.js';

function providerDomain(provider: MailProvider): string {
  switch (provider) {
    case 'Gmail':
      return 'gmail.com';
    case 'Outlook':
      return 'outlook.com';
    case 'Yahoo':
      return 'yahoo.com';
    case 'Proton':
      return 'proton.me';
    case 'iCloud':
      return 'icloud.com';
  }
}

export function generateSeedAccounts(): MailAccountsStore {
  const detailedAccounts: MailAccount[] = [
    {
      id: generateId(),
      email: 'prod.sys.a1@gmail.com',
      provider: 'Gmail',
      status: 'active',
      purpose: 'Main YT Channel',
      linkedPlatforms: ['youtube', 'tiktok'],
      recoveryEmail: 'rec.master@prodops.io',
      recoveryPhone: '+1 (555) 012-3456',
      notes: 'Channel monetized on Oct 12. Requires VPN login via SG node to avoid flags.',
    },
    {
      id: generateId(),
      email: 'scrape.bot.v2@outlook.com',
      provider: 'Outlook',
      status: 'need_verify',
      purpose: 'Data Ingestion',
      linkedPlatforms: ['web'],
      recoveryEmail: 'rec.bot@pro.do',
      recoveryPhone: '+1 (555) 234-5678',
      notes: 'Automated scraping account. SMS verification pending on recovery phone.',
    },
    {
      id: generateId(),
      email: 'legacy.test.09@yahoo.com',
      provider: 'Yahoo',
      status: 'suspended',
      purpose: 'Old FB Campaigns',
      linkedPlatforms: ['facebook'],
      recoveryEmail: 'None',
      recoveryPhone: '',
      notes: 'Suspended due to policy violation. Do not use for new campaigns.',
    },
  ];

  const extras: MailAccount[] = [];
  const providers: MailProvider[] = ['Gmail', 'Outlook', 'Yahoo', 'Proton', 'iCloud'];
  const statuses = ['active', 'need_verify', 'suspended'] as const;
  const platforms = ['youtube', 'tiktok', 'facebook', 'web'] as const;
  const purposes = [
    'YT Shorts Batch',
    'TikTok Daily',
    'FB Reels Promo',
    'Content Scraping',
    'Backup Account',
    'Multi Platform',
    'Legacy Campaign',
    'Test Sandbox',
  ];

  for (let i = 4; i <= 242; i++) {
    const provider = providers[i % providers.length];
    const status = statuses[i % statuses.length];
    const domain = providerDomain(provider);
    extras.push({
      id: generateId(),
      email: `account.${i}@${domain}`,
      provider,
      status,
      purpose: purposes[i % purposes.length],
      linkedPlatforms: [platforms[i % platforms.length]],
      recoveryEmail: `rec.${i}@backup.io`,
      recoveryPhone: `+1 (555) ${String(100 + (i % 900)).padStart(3, '0')}-${String(1000 + (i % 9000)).slice(1)}`,
      notes: `Auto-generated mock account #${i}.`,
    });
  }

  return { accounts: [...detailedAccounts, ...extras] };
}
