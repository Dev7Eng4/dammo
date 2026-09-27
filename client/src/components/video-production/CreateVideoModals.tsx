import { useTranslation } from 'react-i18next';
import { Button, Modal } from '../ui';

interface CreateVideoConfirmModalProps {
  open: boolean;
  creating?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function CreateVideoConfirmModal({
  open,
  creating,
  onClose,
  onConfirm,
}: CreateVideoConfirmModalProps) {
  const { t } = useTranslation('factory');
  const { t: tCommon } = useTranslation('common');

  return (
    <Modal
      open={open}
      onClose={creating ? () => undefined : onClose}
      title={t('production.createVideo.confirmTitle')}
      className="max-w-sm"
      footer={
        <>
          <Button
            variant="outlined"
            size="sm"
            className="rounded-lg"
            onClick={onClose}
            disabled={creating}
          >
            {tCommon('actions.cancel')}
          </Button>
          <Button size="sm" className="rounded-lg" onClick={onConfirm} disabled={creating}>
            {creating ? t('production.createVideo.confirmSending') : tCommon('actions.yes')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-neutral-300">{t('production.createVideo.confirmBody')}</p>
    </Modal>
  );
}

interface CreateVideoErrorModalProps {
  message: string | null;
  onClose: () => void;
}

export function CreateVideoErrorModal({ message, onClose }: CreateVideoErrorModalProps) {
  const { t } = useTranslation('factory');
  const { t: tCommon } = useTranslation('common');

  return (
    <Modal
      open={message != null}
      onClose={onClose}
      title={t('production.createVideo.errorTitle')}
      className="max-w-sm"
      footer={
        <Button size="sm" className="rounded-lg" onClick={onClose}>
          {tCommon('actions.close')}
        </Button>
      }
    >
      <p className="text-sm text-neutral-300">{message}</p>
    </Modal>
  );
}
