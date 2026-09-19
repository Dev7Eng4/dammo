import { useTranslation } from 'react-i18next'
import { Button, Modal } from '../ui'

interface DeleteYoutubeChannelConfirmModalProps {
  open: boolean
  channelName: string
  deleting?: boolean
  onClose: () => void
  onConfirm: () => void
}

export function DeleteYoutubeChannelConfirmModal({
  open,
  channelName,
  deleting,
  onClose,
  onConfirm,
}: DeleteYoutubeChannelConfirmModalProps) {
  const { t } = useTranslation('youtube')
  const { t: tCommon } = useTranslation('common')

  return (
    <Modal
      open={open}
      onClose={deleting ? () => undefined : onClose}
      title={t('delete.modalTitle')}
      className="max-w-sm"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={onClose} disabled={deleting}>
            {tCommon('actions.cancel')}
          </Button>
          <Button variant="danger" size="sm" className="rounded-lg" onClick={onConfirm} disabled={deleting}>
            {deleting ? tCommon('actions.deleting') : tCommon('actions.delete')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-neutral-300">{t('delete.body', { name: channelName })}</p>
    </Modal>
  )
}
