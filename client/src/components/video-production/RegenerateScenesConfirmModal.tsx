import { useTranslation } from 'react-i18next';
import { Button, Modal } from '../ui';

interface RegenerateScenesConfirmModalProps {
  open: boolean;
  regenerating?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function RegenerateScenesConfirmModal({
  open,
  regenerating,
  onClose,
  onConfirm,
}: RegenerateScenesConfirmModalProps) {
  const { t } = useTranslation('factory');
  const { t: tCommon } = useTranslation('common');

  return (
    <Modal
      open={open}
      onClose={regenerating ? () => undefined : onClose}
      title={t('production.scenes.regenConfirmTitle')}
      className="max-w-sm"
      footer={
        <>
          <Button
            variant="outlined"
            size="sm"
            className="rounded-lg"
            onClick={onClose}
            disabled={regenerating}
          >
            {tCommon('actions.cancel')}
          </Button>
          <Button size="sm" className="rounded-lg" onClick={onConfirm} disabled={regenerating}>
            {regenerating
              ? t('production.scenes.regenConfirmSending')
              : tCommon('actions.yes')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-neutral-300">{t('production.scenes.regenConfirmBody')}</p>
    </Modal>
  );
}
