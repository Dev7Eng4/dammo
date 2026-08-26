import { Button, Modal } from '../ui';

interface RegenerateMetadataConfirmModalProps {
  open: boolean;
  regenerating?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function RegenerateMetadataConfirmModal({
  open,
  regenerating,
  onClose,
  onConfirm,
}: RegenerateMetadataConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={regenerating ? () => undefined : onClose}
      title="Tạo lại metadata?"
      className="max-w-sm"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={onClose} disabled={regenerating}>
            Hủy
          </Button>
          <Button size="sm" className="rounded-lg" onClick={onConfirm} disabled={regenerating}>
            {regenerating ? 'Đang gửi…' : 'Có'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-neutral-300">Bạn có muốn tạo lại metadata và thumbnail không?</p>
    </Modal>
  );
}
