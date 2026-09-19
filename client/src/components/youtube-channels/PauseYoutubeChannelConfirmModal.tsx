import { useTranslation } from 'react-i18next'
import { Button, Modal } from '../ui'

interface PauseYoutubeChannelConfirmModalProps {
  open: boolean
  channelName: string
  pausing?: boolean
  onClose: () => void
  onConfirm: () => void
}

export function PauseYoutubeChannelConfirmModal({
  open,
  channelName,
  pausing,
  onClose,
  onConfirm,
}: PauseYoutubeChannelConfirmModalProps) {
  const { t } = useTranslation('youtube')
  const { t: tCommon } = useTranslation('common')

  return (
    <Modal
      open={open}
      onClose={pausing ? () => undefined : onClose}
      title={t('pause.modalTitle')}
      className="max-w-sm"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={onClose} disabled={pausing}>
            {tCommon('actions.cancel')}
          </Button>
          <Button variant="primary" size="sm" className="rounded-lg" onClick={onConfirm} disabled={pausing}>
            {pausing ? t('pause.pausing') : t('pause.confirm')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-neutral-300">{t('pause.body', { name: channelName })}</p>
    </Modal>
  )
}
