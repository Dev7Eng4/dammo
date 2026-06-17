export const navItems = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: 'dashboard' },
  { id: 'mail', label: 'Mail Accounts', path: '/mail-accounts', icon: 'mail' },
  { id: 'youtube', label: 'YouTube Channels', path: '/youtube-channels', icon: 'youtube' },
  { id: 'tiktok', label: 'TikTok Accounts', path: '/tiktok-accounts', icon: 'tiktok' },
  { id: 'facebook', label: 'Facebook Assets', path: '/facebook-assets', icon: 'facebook' },
  { id: 'source', label: 'Source Channels', path: '/source-channels', icon: 'source' },
  { id: 'chrome-profiles', label: 'Chrome Profiles', path: '/chrome-profiles', icon: 'browser' },
  { id: 'projects', label: 'Content Projects', path: '/content-projects', icon: 'projects' },
  { id: 'factory', label: 'Video Factory', path: '/video-factory', icon: 'factory' },
  { id: 'queue', label: 'Render Queue', path: '/render-queue', icon: 'queue' },
  { id: 'excel', label: 'Excel Import/Export', path: '/excel-import-export', icon: 'excel' },
] as const;

export const footerNavItem = {
  id: 'settings',
  label: 'Workspace Settings',
  path: '/workspace-settings',
  icon: 'settings',
} as const;

export type NavIcon = (typeof navItems)[number]['icon'] | typeof footerNavItem.icon;
