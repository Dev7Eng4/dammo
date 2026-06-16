import { useLocation } from 'react-router-dom';
import { footerNavItem, navItems } from '../config/navigation';

export function PlaceholderPage() {
  const { pathname } = useLocation();

  const allItems = [...navItems, footerNavItem];
  const match = allItems.find((item) => item.path === pathname);
  const title = match?.label ?? 'Module';

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center card-surface p-12 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-surface-elevated">
        <svg className="size-8 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-neutral-100">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-neutral-400">
        Tính năng đang phát triển. Module này sẽ có sẵn trong phiên bản tiếp theo.
      </p>
    </div>
  );
}
