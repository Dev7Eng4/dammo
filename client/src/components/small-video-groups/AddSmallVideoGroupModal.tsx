import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { createSmallVideoGroup } from '../../api/small-video-groups';
import { Button, Input, Modal, Textarea } from '../ui';
import type { SmallVideoGroupFormValues } from '../../types/smallVideoGroup';

interface AddSmallVideoGroupModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddSmallVideoGroupModal({ open, onClose, onSuccess }: AddSmallVideoGroupModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SmallVideoGroupFormValues>({
    defaultValues: {
      name: '',
      note: '',
    },
  });

  function handleClose() {
    reset();
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: SmallVideoGroupFormValues) {
    setApiError(null);
    try {
      await createSmallVideoGroup({
        name: values.name,
        note: values.note.trim() || undefined,
      });
      reset();
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Không thể thêm nhóm');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Thêm nhóm video stock nhỏ"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button size="sm" className="rounded-lg" disabled={isSubmitting} form="add-small-video-group-form" type="submit">
            {isSubmitting ? 'Đang lưu...' : 'Thêm'}
          </Button>
        </>
      }
    >
      <form id="add-small-video-group-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="small-video-group-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Tên nhóm
          </label>
          <Input
            id="small-video-group-name"
            placeholder="Tên nhóm"
            className="h-10 rounded-lg"
            {...register('name', { required: 'Vui lòng nhập tên nhóm' })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        <div>
          <label htmlFor="small-video-group-note" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Ghi chú (tuỳ chọn)
          </label>
          <Textarea
            id="small-video-group-note"
            rows={3}
            placeholder="Ghi chú ngắn..."
            className="text-sm"
            {...register('note')}
          />
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
