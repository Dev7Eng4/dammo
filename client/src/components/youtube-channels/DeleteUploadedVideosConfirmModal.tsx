import { useEffect, useState } from 'react';
import { Button, Modal } from '../ui';

export interface DeleteUploadedVideosConfirmOptions {
  deletePreparedVideos: boolean;
}

interface DeleteUploadedVideosConfirmModalProps {
  open: boolean;
  deleting?: boolean;
  onClose: () => void;
  onConfirm: (options: DeleteUploadedVideosConfirmOptions) => void;
}

export function DeleteUploadedVideosConfirmModal({
  open,
  deleting,
  onClose,
  onConfirm,
}: DeleteUploadedVideosConfirmModalProps) {
  const [deletePreparedVideos, setDeletePreparedVideos] = useState(false);

  useEffect(() => {
    if (open) {
      setDeletePreparedVideos(false);
    }
  }, [open]);

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
          <Button
            size='sm'
            className='rounded-lg'
            onClick={() => onConfirm({ deletePreparedVideos })}
            disabled={deleting}
          >
            {deleting ? 'Đang xóa…' : 'Xóa'}
          </Button>
        </>
      }
    >
      <div className='space-y-3'>
        <p className='text-sm text-neutral-300'>
          Bạn có chắc muốn xóa tất cả folder video trong uploads/ của mọi kênh YouTube? Thao tác này không thể hoàn
          tác.
        </p>
        <label
          htmlFor='delete-prepared-videos'
          className='flex cursor-pointer items-start gap-2 text-sm text-neutral-200'
        >
          <input
            id='delete-prepared-videos'
            type='checkbox'
            checked={deletePreparedVideos}
            onChange={e => setDeletePreparedVideos(e.target.checked)}
            disabled={deleting}
            className='mt-0.5 size-3.5 shrink-0 rounded border-border bg-surface accent-primary-500 disabled:cursor-not-allowed disabled:opacity-50'
          />
          <span>
            <span className='block'>Xóa video đã tạo trong videos</span>
            <span className='mt-0.5 block text-xs text-neutral-400'>
              Xóa thêm folder trong videos/ và mục prepare không phải Uploaded.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}
