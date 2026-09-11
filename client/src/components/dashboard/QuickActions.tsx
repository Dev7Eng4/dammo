import { FileSpreadsheet, FolderKanban, Mail, Play, Clapperboard } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../ui'

const actions = [
  { label: 'Thêm email', to: '/mail-accounts', icon: Mail },
  { label: 'Thêm kênh YT', to: '/youtube-channels', icon: Clapperboard },
  { label: 'Video Factory', to: '/video-factory', icon: FolderKanban },
  { label: 'Tài nguyên', to: '/assets', icon: FileSpreadsheet },
]

export function QuickActions() {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">Thao tác nhanh</p>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.label}
              to={action.to}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface px-3 py-3.5 text-xs text-muted-foreground transition-colors duration-150 hover:bg-surface-elevated hover:text-foreground"
            >
              <Icon className="size-5" />
              {action.label}
            </Link>
          )
        })}
      </div>
      <Button asChild variant="primary" className="w-full">
        <Link to="/render-queue">
          <Play className="size-4" />
          Bắt đầu hàng đợi render
        </Link>
      </Button>
    </div>
  )
}
