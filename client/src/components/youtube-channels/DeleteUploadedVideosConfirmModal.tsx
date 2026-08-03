import { Button, Modal } from '../ui';

interface DeleteUploadedVideosConfirmModalProps {
  open: boolean;
  deleting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteUploadedVideosConfirmModal({
  open,
  deleting,
  onClose,
  onConfirm,
}: DeleteUploadedVideosConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={deleting ? () => undefined : onClose}
      title='Xóa video Đã tạo?'
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
        Bạn có chắc muốn xóa tất cả folder video trong uploads/ của mọi kênh YouTube? Thao tác này không thể hoàn
        tác.
      </p>
    </Modal>
  );
}
