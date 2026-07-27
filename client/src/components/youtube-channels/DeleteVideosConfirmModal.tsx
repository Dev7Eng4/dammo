import { Button, Modal } from '../ui';

interface DeleteVideosConfirmModalProps {
  open: boolean;
  count: number;
  deleting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteVideosConfirmModal({
  open,
  count,
  deleting,
  onClose,
  onConfirm,
}: DeleteVideosConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={deleting ? () => undefined : onClose}
      title='Xóa video?'
      className='max-w-sm'
      footer={
        <>
          <Button variant='outlined' size='sm' className='rounded-lg' onClick={onClose} disabled={deleting}>
            Hủy
          </Button>
          <Button size='sm' className='rounded-lg' onClick={onConfirm} disabled={deleting}>
            {deleting ? 'Đang xóa…' : 'Xóa'}
          </Button>
        </>
      }
    >
      <p className='text-sm text-neutral-300'>
        Bạn có chắc muốn xóa {count} video đã chọn? Thao tác này sẽ xóa thư mục video và mục tương ứng trong
        video-prepare.json.
      </p>
    </Modal>
  );
}
