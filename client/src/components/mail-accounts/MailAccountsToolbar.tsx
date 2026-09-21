import { useTranslation } from 'react-i18next'
import { SearchInput } from '../ui'
import { ListToolbar } from '../layout'
import { Button } from '../ui'

interface MailAccountsToolbarProps {
  total: number
  search?: string
  canEdit?: boolean
  editDisabledReason?: string
  canDelete?: boolean
  deleteDisabledReason?: string
  deleting?: boolean
  canGmailLogin?: boolean
  gmailLoginDisabledReason?: string
  gmailLoggingIn?: boolean
  onSearchChange?: (value: string) => void
  onAddMail: () => void
  onEdit?: () => void
  onDelete?: () => void
  onGmailLogin?: () => void
  onExportExcel: () => void
  exporting?: boolean
}

export function MailAccountsToolbar({
  total,
  search = '',
  canEdit = false,
  editDisabledReason,
  canDelete = false,
  deleteDisabledReason,
  deleting = false,
  canGmailLogin = false,
  gmailLoginDisabledReason,
  gmailLoggingIn = false,
  onSearchChange,
  onAddMail,
  onEdit,
  onDelete,
  onGmailLogin,
  onExportExcel,
  exporting = false,
}: MailAccountsToolbarProps) {
  const { t, i18n } = useTranslation('mail')
  const numberLocale = i18n.language.startsWith('vi') ? 'vi-VN' : 'en-US'

  return (
    <div className="border-b border-border pb-4">
      <ListToolbar
        countLabel={<span>{t('toolbar.count', { count: total.toLocaleString(numberLocale) })}</span>}
        filters={
          onSearchChange ? (
            <div className="w-48 lg:w-56">
              <SearchInput
                value={search}
                onChange={(e) => onSearchChange(e.currentTarget.value)}
                placeholder={t('toolbar.search')}
                className="h-9"
              />
            </div>
          ) : null
        }
        extraActions={
          <>
            {onGmailLogin ? (
              <Button
                variant="outlined"
                size="sm"
                disabled={!canGmailLogin || gmailLoggingIn}
                title={!canGmailLogin ? gmailLoginDisabledReason : undefined}
                onClick={onGmailLogin}
              >
                {gmailLoggingIn ? t('toolbar.gmailLoginWorking') : t('toolbar.gmailLogin')}
              </Button>
            ) : null}
            {onEdit ? (
              <Button
                variant="outlined"
                size="sm"
                disabled={!canEdit}
                title={!canEdit ? editDisabledReason : undefined}
                onClick={onEdit}
              >
                {t('toolbar.edit')}
              </Button>
            ) : null}
            {onDelete ? (
              <Button
                variant="danger"
                size="sm"
                disabled={deleting || !canDelete}
                title={!deleting && !canDelete ? deleteDisabledReason : undefined}
                onClick={onDelete}
              >
                {deleting ? t('toolbar.deleting') : t('toolbar.delete')}
              </Button>
            ) : null}
          </>
        }
        primaryAction={{ label: t('toolbar.add'), onClick: onAddMail }}
        secondaryActions={[
          {
            id: 'export',
            label: exporting ? t('toolbar.exporting') : t('toolbar.export'),
            onSelect: onExportExcel,
            disabled: exporting,
          },
        ]}
      />
    </div>
  )
}
