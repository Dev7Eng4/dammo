import { Button, Modal } from '../ui';

interface DeleteYoutubeChannelConfirmModalProps {
  open: boolean;
  channelName: string;
  deleting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteYoutubeChannelConfirmModal({
  open,
  channelName,
  deleting,
  onClose,
  onConfirm,
}: DeleteYoutubeChannelConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={deleting ? () => undefined : onClose}
      title='Xóa kênh?'
      className='max-w-sm'
      footer={
        <>
          <Button variant='outlined' size='sm' className='rounded-lg' onClick={onClose} disabled={deleting}>
            Hủy
          </Button>
          <Button variant='danger' size='sm' className='rounded-lg' onClick={onConfirm} disabled={deleting}>
            {deleting ? 'Đang xóa…' : 'Xóa'}
          </Button>
        </>
      }
    >
      <p className='text-sm text-neutral-300'>
        Bạn có chắc muốn xóa kênh <span className='font-medium text-neutral-100'>{channelName}</span>? Thao tác
        này sẽ xóa thông tin kênh và toàn bộ dữ liệu liên quan. Không thể hoàn tác.
      </p>
    </Modal>
  );
}
