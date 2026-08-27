export type NavIcon =
  | 'dashboard'
  | 'mail'
  | 'youtube'
  | 'tiktok'
  | 'facebook'
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
  | 'support'
  | 'logs'
  | 'settings';

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
  // {
  //   id: 'main',
  //   label: 'CHÍNH',
  //   items: [{ id: 'dashboard', label: 'Tổng quan', path: '/', icon: 'dashboard' }],
  // },
  {
    id: 'accounts',
    label: 'TÀI KHOẢN',
    items: [
      { id: 'mail', label: 'Email', path: '/mail-accounts', icon: 'mail' },
      { id: 'youtube', label: 'YouTube', path: '/youtube-channels', icon: 'youtube' },
      { id: 'tiktok', label: 'TikTok', path: '/tiktok-accounts', icon: 'tiktok' },
      { id: 'facebook', label: 'Facebook', path: '/facebook-assets', icon: 'facebook' },
    ],
  },
  {
    id: 'browser-operations',
    label: 'TRÌNH DUYỆT',
    items: [
      { id: 'chrome-profiles', label: 'Hồ sơ Chrome', path: '/chrome-profiles', icon: 'browser' },
      { id: 'gpm-manager', label: 'Quản lý GPM', path: '/gpm-manager', icon: 'gpm' },
      { id: 'proxies', label: 'Proxy', path: '/proxies', icon: 'proxies' },
      // { id: 'launch-logs', label: 'Nhật ký khởi chạy', path: '/launch-logs', icon: 'launch-logs' },
    ],
  },
  {
    id: 'sources',
    label: 'NGUỒN',
    items: [{ id: 'source', label: 'Kênh nguồn', path: '/source-channels', icon: 'source' }],
  },
  {
    id: 'content',
    label: 'NỘI DUNG',
    items: [
      { id: 'prompts', label: 'Prompt', path: '/prompts', icon: 'prompt' },
      { id: 'visual-styles', label: 'Phong cách hình ảnh', path: '/visual-styles', icon: 'visual-styles' },
      { id: 'assets', label: 'Tài nguyên', path: '/assets', icon: 'assets' },
    ],
  },
  {
    id: 'video-factory',
    label: 'NHÀ MÁY VIDEO',
    items: [
      // { id: 'templates', label: 'Mẫu', path: '/video-factory/templates', icon: 'templates' },
      // { id: 'factory', label: 'Nhà máy video', path: '/video-factory', icon: 'factory' },
      { id: 'task-queue', label: 'Công việc đang chạy', path: '/task-queue', icon: 'task-queue' },
      { id: 'queue', label: 'Hàng đợi render', path: '/render-queue', icon: 'queue' },
      { id: 'settings', label: 'Cài đặt', path: '/settings', icon: 'settings' },
    ],
  },
];

export const footerNavItems: NavItem[] = [
  { id: 'support', label: 'Hỗ trợ', path: '/support', icon: 'support' },
];

export function flattenNavItems(): NavItem[] {
  return [...navSections.flatMap(section => section.items), ...footerNavItems];
}

/** @deprecated Use flattenNavItems() */
export const navItems = flattenNavItems().filter(item => !footerNavItems.some(footer => footer.id === item.id));
