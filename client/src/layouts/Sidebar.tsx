import { useCallback, useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BookOpen,
  BrainCircuit,
  Clapperboard,
  Database,
  Flag,
  FlaskConical,
  Factory,
  FileCode2,
  FileSpreadsheet,
  FolderKanban,
  Globe,
  Image,
  LayoutDashboard,
  LayoutTemplate,
  Lightbulb,
  ListTodo,
  Mail,
  Palette,
  PanelLeft,
  PanelLeftClose,
  PenLine,
  Radar,
  Rocket,
  Settings,
  Shield,
  TrendingUp,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../lib/cn'
import { footerNavItems, navSections, type NavIcon, type NavItem } from '../config/navigation'
import { LanguageSwitcher } from '../components/theme/LanguageSwitcher'
import { ThemeToggleButton } from '../components/theme/ThemeToggleButton'
import { Button, Tooltip } from '../components/ui'

const STORAGE_KEY = 'dammo-sidebar-collapsed'

const iconMap: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  mail: Mail,
  youtube: Clapperboard,
  source: BookOpen,
  radar: Radar,
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
  logs: FileCode2,
  settings: Settings,
  roadmap: TrendingUp,
  facebook: Flag,
  test: FlaskConical,
  agent: BrainCircuit,
  manual: PenLine,
}

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function NavItemLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { t } = useTranslation('nav')
  const label = t(item.labelKey)
  const end = item.path === '/' || item.path === '/video-factory'
  const Icon = iconMap[item.icon] ?? LayoutDashboard

  const link = (
    <NavLink
      to={item.path}
      end={end}
      title={collapsed ? undefined : label}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center rounded-md text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/60',
          collapsed ? 'size-9 justify-center px-0' : 'h-8 w-full gap-2.5 px-2.5',
          isActive
            ? 'bg-[var(--app-nav-active)] text-foreground shadow-[inset_0_0_0_1px_var(--app-border),0_1px_2px_rgb(0_0_0/0.15)]'
            : 'text-muted-foreground hover:bg-surface-elevated/60 hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            strokeWidth={isActive ? 2.25 : 1.75}
            className={cn(
              'size-[15px] shrink-0 transition-colors duration-150',
              isActive ? 'text-primary-500' : 'text-muted-foreground/80 group-hover:text-foreground',
            )}
          />
          {!collapsed ? <span className="truncate">{label}</span> : null}
        </>
      )}
    </NavLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip content={label} side="right">
      {link}
    </Tooltip>
  )
}

function BrandMark() {
  return (
    <div className="relative flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-primary-400 to-primary-600 text-[13px] font-bold text-on-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_1px_2px_rgb(0_0_0/0.3),0_4px_12px_-2px_color-mix(in_srgb,var(--color-primary-500)_45%,transparent)]">
      D
    </div>
  )
}

function BrandHeader({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation('nav')

  return (
    <div
      className={cn(
        'flex w-full items-center',
        collapsed ? 'justify-center' : 'gap-2.5 px-1.5',
      )}
    >
      <BrandMark />
      {!collapsed ? (
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold tracking-tight text-foreground">Dammo</p>
          <p className="truncate text-[11px] text-muted-foreground">{t('brand.tagline')}</p>
        </div>
      ) : null}
    </div>
  )
}

export function Sidebar() {
  const { t } = useTranslation(['nav', 'common'])
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

  const toggleLabel = collapsed ? t('common:sidebar.expand') : t('common:sidebar.collapse')

  const toggleButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
      onClick={toggleCollapsed}
      aria-label={toggleLabel}
      aria-expanded={!collapsed}
      title={collapsed ? undefined : toggleLabel}
    >
      {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
    </Button>
  )

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col transition-[width] duration-200 ease-out',
        collapsed ? 'w-[60px]' : 'w-60',
      )}
    >
      <div className={cn('pb-2 pt-3.5', collapsed ? 'flex flex-col items-center gap-3 px-2' : 'flex items-center gap-1 px-3')}>
        <div className={collapsed ? undefined : 'min-w-0 flex-1'}>
          <BrandHeader collapsed={collapsed} />
        </div>
        {collapsed ? (
          <Tooltip content={toggleLabel} side="right">
            {toggleButton}
          </Tooltip>
        ) : (
          toggleButton
        )}
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain px-3 pb-2">
        {navSections.map((section, sectionIndex) => (
          <div key={section.id} className="mt-1">
            {collapsed ? (
              sectionIndex > 0 ? (
                <div className="mx-auto my-2.5 h-px w-5 bg-border/80" aria-hidden />
              ) : null
            ) : (
              <p className="px-2.5 pb-1 pt-4 text-[11px] font-medium text-muted-foreground/70">
                {t(section.labelKey)}
              </p>
            )}
            <div className={cn(collapsed ? 'flex flex-col items-center gap-1' : 'space-y-px')}>
              {section.items.map((item) => (
                <NavItemLink key={item.id} item={item} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div
        className={cn(
          'mx-3 mb-2 border-t border-border/60 pt-2',
          collapsed ? 'flex flex-col items-center gap-1.5' : 'flex items-center justify-end gap-1',
        )}
      >
        {footerNavItems.length > 0 ? (
          <div className={cn(collapsed ? 'flex flex-col items-center gap-1' : 'min-w-0 flex-1 space-y-px')}>
            {footerNavItems.map((item) => (
              <NavItemLink key={item.id} item={item} collapsed={collapsed} />
            ))}
          </div>
        ) : null}
        <LanguageSwitcher />
        <ThemeToggleButton />
      </div>
    </aside>
  )
}
