import { Trans, useTranslation } from 'react-i18next';
import { Button, Modal } from '../ui';

interface DeleteMailAccountConfirmModalProps {
  open: boolean;
  email: string;
  deleting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteMailAccountConfirmModal({
  open,
  email,
  deleting,
  onClose,
  onConfirm,
}: DeleteMailAccountConfirmModalProps) {
  const { t } = useTranslation(['mail', 'common']);

  return (
    <Modal
      open={open}
      onClose={deleting ? () => undefined : onClose}
      title={t('delete.title')}
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
      <p className="text-sm text-neutral-300">
        <Trans
          i18nKey="delete.body"
          ns="mail"
          values={{ email }}
          components={{
            email: <span className="font-medium text-neutral-100" />,
          }}
        />
      </p>
    </Modal>
  );
}
