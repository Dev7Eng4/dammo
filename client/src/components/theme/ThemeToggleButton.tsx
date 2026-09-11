import { Moon, Sun } from 'lucide-react'
import { Button } from '../ui/Button'
import { useTheme } from '../../theme/ThemeProvider'
import { cn } from '../../lib/cn'

export function ThemeToggleButton({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('size-9 shrink-0', className)}
      onClick={toggleTheme}
      aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
      title={isDark ? 'Giao diện sáng' : 'Giao diện tối'}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}
