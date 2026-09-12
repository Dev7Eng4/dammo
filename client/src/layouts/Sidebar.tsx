import { useCallback, useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  BookOpen,
  Clapperboard,
  Database,
  Factory,
  FileCode2,
  FileSpreadsheet,
  FolderKanban,
  Globe,
  HelpCircle,
  Image,
  LayoutDashboard,
  LayoutTemplate,
  Lightbulb,
  ListTodo,
  Mail,
  Palette,
  PanelLeft,
  PanelLeftClose,
  Radio,
  Rocket,
  Settings,
  Shield,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../lib/cn'
import { footerNavItems, navSections, type NavIcon, type NavItem } from '../config/navigation'
import { ThemeToggleButton } from '../components/theme/ThemeToggleButton'
import { Button, Tooltip } from '../components/ui'

const STORAGE_KEY = 'dammo-sidebar-collapsed'

const iconMap: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  mail: Mail,
  youtube: Clapperboard,
  tiktok: Radio,
  facebook: Globe,
  source: BookOpen,
  prompt: Lightbulb,
  'visual-styles': Palette,
  browser: Globe,
  gpm: UserPlus,
  proxies: Shield,
  'launch-logs': Rocket,
  projects: FolderKanban,
  scripts: FileCode2,
  datasets: Database,
  assets: Image,
  excel: FileSpreadsheet,
  templates: LayoutTemplate,
  factory: Factory,
  queue: ListTodo,
  'task-queue': ListTodo,
  support: HelpCircle,
  logs: FileCode2,
  settings: Settings,
}

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function NavItemLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const end = item.path === '/' || item.path === '/video-factory'
  const Icon = iconMap[item.icon] ?? LayoutDashboard

  const link = (
    <NavLink
      to={item.path}
      end={end}
      title={collapsed ? undefined : item.label}
      className={({ isActive }) =>
        cn(
          'flex items-center rounded-lg text-sm font-medium transition-colors duration-150',
          collapsed ? 'size-9 justify-center px-0' : 'w-full gap-3 px-3 py-2',
          isActive
            ? 'bg-primary-500/15 text-foreground'
            : 'text-muted-foreground hover:bg-surface-elevated hover:text-foreground',
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </NavLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  )
}

function BrandHeader({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={cn(
        'flex w-full items-center',
        collapsed ? 'justify-center px-0 py-1' : 'gap-2.5 px-2 py-1',
      )}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-sm font-bold text-on-primary">
        D
      </div>
      {!collapsed ? (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">Dammo</p>
          <p className="truncate text-[10px] text-muted-foreground">Video operations</p>
        </div>
      ) : null}
    </div>
  )
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(readStoredCollapsed)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed))
    } catch {
      /* ignore */
    }
  }, [collapsed])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev)
  }, [])

  const toggleLabel = collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 ease-out',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      <div className={cn('border-b border-border py-3', collapsed ? 'px-2' : 'px-3')}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-3">
            <BrandHeader collapsed />
            <Tooltip content={toggleLabel} side="right">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                onClick={toggleCollapsed}
                aria-label={toggleLabel}
                aria-expanded={!collapsed}
              >
                <PanelLeft className="size-4" />
              </Button>
            </Tooltip>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <BrandHeader collapsed={false} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              onClick={toggleCollapsed}
              aria-label={toggleLabel}
              aria-expanded={!collapsed}
              title={toggleLabel}
            >
              <PanelLeftClose className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <nav
        className={cn(
          'scrollbar-thin flex-1 overflow-y-auto overscroll-contain py-2',
          collapsed ? 'px-2' : 'px-2',
        )}
      >
        {navSections.map((section, sectionIndex) => (
          <div key={section.id} className={collapsed ? 'mb-3' : 'mb-1'}>
            {collapsed ? (
              sectionIndex > 0 ? (
                <div className="mx-auto my-2 h-px w-6 bg-border" aria-hidden />
              ) : null
            ) : (
              <p className="px-3 pb-1.5 pt-4 text-[10px] font-semibold tracking-wider text-muted-foreground">
                {section.label}
              </p>
            )}
            <div
              className={cn(
                collapsed ? 'flex flex-col items-center gap-2' : 'space-y-0.5',
              )}
            >
              {section.items.map((item) => (
                <NavItemLink key={item.id} item={item} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div
        className={cn(
          'border-t border-border px-2 py-3',
          collapsed ? 'flex flex-col items-center gap-2' : 'flex items-center gap-1',
        )}
      >
        <div
          className={cn(
            collapsed ? 'flex flex-col items-center gap-2' : 'min-w-0 flex-1 space-y-0.5',
          )}
        >
          {footerNavItems.map((item) => (
            <NavItemLink key={item.id} item={item} collapsed={collapsed} />
          ))}
        </div>
        <ThemeToggleButton className={collapsed ? undefined : 'mr-1'} />
      </div>
    </aside>
  )
}
