import { useTranslation } from 'react-i18next'
import { Button, Modal } from '../ui'

interface ConfirmDeleteModalProps {
  open: boolean
  title: string
  /** What is being deleted, shown highlighted in the message. */
  name: string
  message: string
  deleting?: boolean
  onClose: () => void
  onConfirm: () => void
}

/** In-app delete confirmation (instead of the browser's window.confirm). */
export function ConfirmDeleteModal({ open, title, name, message, deleting, onClose, onConfirm }: ConfirmDeleteModalProps) {
  const { t } = useTranslation('common')

  return (
    <Modal
      open={open}
      onClose={deleting ? () => undefined : onClose}
      title={title}
      className="max-w-sm"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={onClose} disabled={deleting}>
            {t('actions.cancel')}
          </Button>
          <Button variant="danger" size="sm" className="rounded-lg" onClick={onConfirm} disabled={deleting}>
            {deleting ? t('actions.deleting') : t('actions.delete')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{name}</span> — {message}
      </p>
    </Modal>
  )
}
