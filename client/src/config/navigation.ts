export type NavIcon =
  | 'dashboard'
  | 'mail'
  | 'youtube'
  | 'source'
  | 'prompt'
  | 'visual-styles'
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
  | 'logs'
  | 'settings';

export interface NavItem {
  id: string;
  /** i18n key under `nav` namespace, e.g. `item.mail` */
  labelKey: string;
  path: string;
  icon: NavIcon;
}

export interface NavSection {
  id: string;
  /** i18n key under `nav` namespace, e.g. `section.accounts` */
  labelKey: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    id: 'accounts',
    labelKey: 'section.accounts',
    items: [
      { id: 'mail', labelKey: 'item.mail', path: '/mail-accounts', icon: 'mail' },
      { id: 'youtube', labelKey: 'item.youtube', path: '/youtube-channels', icon: 'youtube' },
    ],
  },
  {
    id: 'browser-operations',
    labelKey: 'section.browser',
    items: [
      { id: 'chrome-profiles', labelKey: 'item.chromeProfiles', path: '/chrome-profiles', icon: 'browser' },
      { id: 'gpm-manager', labelKey: 'item.gpmManager', path: '/gpm-manager', icon: 'gpm' },
      { id: 'proxies', labelKey: 'item.proxies', path: '/proxies', icon: 'proxies' },
    ],
  },
  {
    id: 'sources',
    labelKey: 'section.sources',
    items: [{ id: 'source', labelKey: 'item.source', path: '/source-channels', icon: 'source' }],
  },
  {
    id: 'content',
    labelKey: 'section.content',
    items: [
      { id: 'prompts', labelKey: 'item.prompts', path: '/prompts', icon: 'prompt' },
      { id: 'visual-styles', labelKey: 'item.visualStyles', path: '/visual-styles', icon: 'visual-styles' },
      { id: 'assets', labelKey: 'item.assets', path: '/assets', icon: 'assets' },
    ],
  },
  {
    id: 'video-factory',
    labelKey: 'section.videoFactory',
    items: [
      { id: 'task-queue', labelKey: 'item.taskQueue', path: '/task-queue', icon: 'task-queue' },
      { id: 'video-production', labelKey: 'item.videoProduction', path: '/video-production', icon: 'factory' },
      { id: 'settings', labelKey: 'item.settings', path: '/settings', icon: 'settings' },
    ],
  },
];

export const footerNavItems: NavItem[] = [];

export function flattenNavItems(): NavItem[] {
  return [...navSections.flatMap(section => section.items), ...footerNavItems];
}

/** @deprecated Use flattenNavItems() */
export const navItems = flattenNavItems();
