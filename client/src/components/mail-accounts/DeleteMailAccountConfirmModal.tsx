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
  return (
    <Modal
      open={open}
      onClose={deleting ? () => undefined : onClose}
      title="Xóa email?"
      className="max-w-sm"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={onClose} disabled={deleting}>
            Hủy
          </Button>
          <Button variant="danger" size="sm" className="rounded-lg" onClick={onConfirm} disabled={deleting}>
            {deleting ? 'Đang xóa…' : 'Xóa'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-neutral-300">
        Bạn có chắc muốn xóa email <span className="font-medium text-neutral-100">{email}</span>? Thao tác này
        không thể hoàn tác.
      </p>
    </Modal>
  );
}
