import { useTranslation } from 'react-i18next'
import { Button, Modal } from '../ui'

interface RegenerateMetadataConfirmModalProps {
  open: boolean
  regenerating?: boolean
  onClose: () => void
  onConfirm: () => void
}

export function RegenerateMetadataConfirmModal({
  open,
  regenerating,
  onClose,
  onConfirm,
}: RegenerateMetadataConfirmModalProps) {
  const { t } = useTranslation('youtube')
  const { t: tCommon } = useTranslation('common')

  return (
    <Modal
      open={open}
      onClose={regenerating ? () => undefined : onClose}
      title={t('regenerate.title')}
      className="max-w-sm"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={onClose} disabled={regenerating}>
            {tCommon('actions.cancel')}
          </Button>
          <Button size="sm" className="rounded-lg" onClick={onConfirm} disabled={regenerating}>
            {regenerating ? t('regenerate.sending') : tCommon('actions.yes')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-neutral-300">{t('regenerate.body')}</p>
    </Modal>
  )
}
