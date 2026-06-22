export type NavIcon =
  | 'dashboard'
  | 'mail'
  | 'youtube'
  | 'tiktok'
  | 'facebook'
  | 'source'
  | 'prompt'
  | 'browser'
  | 'gpm'
  | 'proxies'
  | 'launch-logs'
  | 'projects'
  | 'scripts'
  | 'datasets'
  | 'assets'
  | 'excel'
  | 'templates'
  | 'factory'
  | 'task-queue'
  | 'queue'
  | 'support'
  | 'logs';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: NavIcon;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    id: 'main',
    label: 'MAIN',
    items: [{ id: 'dashboard', label: 'Dashboard', path: '/', icon: 'dashboard' }],
  },
  {
    id: 'accounts',
    label: 'ACCOUNTS',
    items: [
      { id: 'mail', label: 'Mail', path: '/mail-accounts', icon: 'mail' },
      { id: 'youtube', label: 'YouTube', path: '/youtube-channels', icon: 'youtube' },
      { id: 'tiktok', label: 'TikTok', path: '/tiktok-accounts', icon: 'tiktok' },
      { id: 'facebook', label: 'Facebook', path: '/facebook-assets', icon: 'facebook' },
    ],
  },
  {
    id: 'browser-operations',
    label: 'BROWSER OPERATIONS',
    items: [
      { id: 'chrome-profiles', label: 'Chrome Profiles', path: '/chrome-profiles', icon: 'browser' },
      { id: 'gpm-manager', label: 'GPM Manager', path: '/gpm-manager', icon: 'gpm' },
      { id: 'proxies', label: 'Proxies', path: '/proxies', icon: 'proxies' },
      { id: 'launch-logs', label: 'Launch Logs', path: '/launch-logs', icon: 'launch-logs' },
    ],
  },
  {
    id: 'sources',
    label: 'SOURCES',
    items: [{ id: 'source', label: 'Source Channels', path: '/source-channels', icon: 'source' }],
  },
  {
    id: 'content',
    label: 'CONTENT',
    items: [
      { id: 'projects', label: 'Projects', path: '/content-projects', icon: 'projects' },
      { id: 'scripts', label: 'Scripts', path: '/scripts', icon: 'scripts' },
      { id: 'datasets', label: 'Datasets', path: '/datasets', icon: 'datasets' },
      { id: 'prompts', label: 'Prompts', path: '/prompts', icon: 'prompt' },
      { id: 'assets', label: 'Assets', path: '/assets', icon: 'assets' },
      { id: 'excel', label: 'Excel Import/Export', path: '/excel-import-export', icon: 'excel' },
    ],
  },
  {
    id: 'video-factory',
    label: 'VIDEO FACTORY',
    items: [
      { id: 'templates', label: 'Templates', path: '/video-factory/templates', icon: 'templates' },
      { id: 'factory', label: 'Video Factory', path: '/video-factory', icon: 'factory' },
      { id: 'task-queue', label: 'Active Jobs', path: '/task-queue', icon: 'task-queue' },
      { id: 'queue', label: 'Render Queue', path: '/render-queue', icon: 'queue' },
    ],
  },
];

export const footerNavItems: NavItem[] = [
  { id: 'support', label: 'Support', path: '/support', icon: 'support' },
  { id: 'logs', label: 'Logs', path: '/logs', icon: 'logs' },
];

export function flattenNavItems(): NavItem[] {
  return [...navSections.flatMap((section) => section.items), ...footerNavItems];
}

/** @deprecated Use flattenNavItems() */
export const navItems = flattenNavItems().filter(
  (item) => !footerNavItems.some((footer) => footer.id === item.id),
);
