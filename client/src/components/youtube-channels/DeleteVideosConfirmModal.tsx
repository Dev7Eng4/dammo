import { useTranslation } from 'react-i18next'
import { Button, Modal } from '../ui'

interface DeleteVideosConfirmModalProps {
  open: boolean
  count: number
  deleting?: boolean
  onClose: () => void
  onConfirm: () => void
}

export function DeleteVideosConfirmModal({
  open,
  count,
  deleting,
  onClose,
  onConfirm,
}: DeleteVideosConfirmModalProps) {
  const { t } = useTranslation('youtube')
  const { t: tCommon } = useTranslation('common')

  return (
    <Modal
      open={open}
      onClose={deleting ? () => undefined : onClose}
      title={t('deleteVideos.modalTitle')}
      className="max-w-sm"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={onClose} disabled={deleting}>
            {tCommon('actions.cancel')}
          </Button>
          <Button size="sm" className="rounded-lg" onClick={onConfirm} disabled={deleting}>
            {deleting ? tCommon('actions.deleting') : tCommon('actions.delete')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-neutral-300">{t('deleteVideos.body', { count })}</p>
    </Modal>
  )
}
