import { cn } from '../../lib/cn';
import type { ProxyTab } from '../../types/proxy';

const tabs: Array<{ id: ProxyTab; label: string; disabled?: boolean }> = [
  { id: 'monitoring', label: 'Giám sát' },
  { id: 'providers', label: 'Nhà cung cấp' },
  { id: 'automations', label: 'Tự động hóa', disabled: true },
  { id: 'library', label: 'Thư viện', disabled: true },
];

interface ProxyPageHeaderProps {
  activeTab: ProxyTab;
  onTabChange: (tab: ProxyTab) => void;
}

export function ProxyPageHeader({ activeTab, onTabChange }: ProxyPageHeaderProps) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary-500/10 text-primary-400">
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-neutral-50">Quản lý Proxy</h1>
      </div>

      <div className="mt-4 flex gap-6 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onTabChange(tab.id)}
            title={tab.disabled ? 'Sắp ra mắt' : undefined}
            className={cn(
              'relative pb-3 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'text-primary-400'
                : tab.disabled
                  ? 'cursor-not-allowed text-neutral-500'
                  : 'text-neutral-400 hover:text-neutral-200',
            )}
          >
            {tab.label}
            {activeTab === tab.id ? (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-400" />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
