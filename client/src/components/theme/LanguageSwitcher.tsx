import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { setAppLocale, type AppLocale } from '../../i18n'
import { useTranslation } from 'react-i18next'

export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n, t } = useTranslation('common')
  const current: AppLocale = i18n.language === 'en' ? 'en' : 'vi'

  function select(locale: AppLocale) {
    if (locale === current) return
    setAppLocale(locale)
  }

  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center rounded-lg border border-border p-0.5',
        className,
      )}
      role="group"
      aria-label={t('lang.switchTo', { lang: current.toUpperCase() })}
    >
      {(['vi', 'en'] as const).map((locale) => (
        <Button
          key={locale}
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'h-7 min-w-8 rounded-md px-2 text-xs font-semibold',
            current === locale
              ? 'bg-surface-elevated text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => select(locale)}
          aria-pressed={current === locale}
        >
          {t(`lang.${locale}`)}
        </Button>
      ))}
    </div>
  )
}
