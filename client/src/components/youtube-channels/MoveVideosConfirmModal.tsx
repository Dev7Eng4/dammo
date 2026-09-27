import { useTranslation } from 'react-i18next'
import { Button, Modal } from '../ui'

interface MoveVideosConfirmModalProps {
  open: boolean
  count: number
  channelName: string
  moving?: boolean
  onClose: () => void
  onConfirm: () => void
}

export function MoveVideosConfirmModal({
  open,
  count,
  channelName,
  moving,
  onClose,
  onConfirm,
}: MoveVideosConfirmModalProps) {
  const { t } = useTranslation('youtube')
  const { t: tCommon } = useTranslation('common')

  return (
    <Modal
      open={open}
      onClose={moving ? () => undefined : onClose}
      title={t('moveVideos.confirmModalTitle')}
      className="max-w-sm"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={onClose} disabled={moving}>
            {tCommon('actions.cancel')}
          </Button>
          <Button size="sm" className="rounded-lg" onClick={onConfirm} disabled={moving}>
            {moving ? t('actions.movingVideos') : tCommon('actions.confirm')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-neutral-300">
        {t('moveVideos.confirmBody', { count, channel: channelName })}
      </p>
    </Modal>
  )
}
