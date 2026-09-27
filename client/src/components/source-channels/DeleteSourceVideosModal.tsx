import { useTranslation } from 'react-i18next';
import { Button, Modal } from '../ui';

interface DeleteSourceVideosModalProps {
  open: boolean;
  count: number;
  deleting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteSourceVideosModal({
  open,
  count,
  deleting = false,
  onClose,
  onConfirm,
}: DeleteSourceVideosModalProps) {
  const { t } = useTranslation(['source', 'common']);

  return (
    <Modal
      open={open}
      onClose={() => {
        if (deleting) return;
        onClose();
      }}
      title={t('deleteVideos.title')}
      className="max-w-sm"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={onClose} disabled={deleting}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="danger" size="sm" className="rounded-lg" onClick={onConfirm} disabled={deleting}>
            {deleting ? t('common:actions.deleting') : t('common:actions.delete')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-neutral-300">{t('deleteVideos.body', { count })}</p>
    </Modal>
  );
}
