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

function NavItemLink({ item }: { item: NavItem }) {
  const end = item.path === '/' || item.path === '/video-factory'
  const Icon = iconMap[item.icon] ?? LayoutDashboard

  return (
    <NavLink
      to={item.path}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
          isActive
            ? 'bg-primary-500/15 text-foreground'
            : 'text-muted-foreground hover:bg-surface-elevated hover:text-foreground',
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </NavLink>
  )
}

function BrandHeader() {
  return (
    <div className="flex w-full items-center gap-2.5 px-2 py-1">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-sm font-bold text-on-primary">
        D
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">Dammo</p>
        <p className="truncate text-[10px] text-muted-foreground">Video operations</p>
      </div>
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="border-b border-border px-3 py-3">
        <BrandHeader />
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        {navSections.map((section) => (
          <div key={section.id} className="mb-1">
            <p className="px-3 pb-1.5 pt-4 text-[10px] font-semibold tracking-wider text-muted-foreground">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavItemLink key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-1 border-t border-border px-2 py-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          {footerNavItems.map((item) => (
            <NavItemLink key={item.id} item={item} />
          ))}
        </div>
        <ThemeToggleButton className="mr-1" />
      </div>
    </aside>
  )
}
