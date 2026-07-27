import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { updateVisualStyle } from '../../api/visualStyles';
import { Button, Input, Modal, Textarea } from '../ui';
import type { VisualStyle, VisualStyleFormValues } from '../../types/visualStyle';

interface EditVisualStyleModalProps {
  open: boolean;
  style: VisualStyle | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditVisualStyleModal({
  open,
  style,
  onClose,
  onSuccess,
}: EditVisualStyleModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<VisualStyleFormValues>();

  useEffect(() => {
    if (!style) return;
    reset({
      name: style.name,
      niche: style.niche,
      rule: style.rule,
    });
  }, [style, reset]);

  function handleClose() {
    reset();
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: VisualStyleFormValues) {
    if (!style) return;
    setApiError(null);
    try {
      await updateVisualStyle(style.id, {
        name: values.name,
        niche: values.niche,
        rule: values.rule,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Không thể cập nhật phong cách hình ảnh');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Sửa phong cách hình ảnh"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={isSubmitting || !style}
            form="edit-visual-style-form"
            type="submit"
          >
            {isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
          </Button>
        </>
      }
    >
      <form id="edit-visual-style-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="edit-style-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Tên
          </label>
          <Input
            id="edit-style-name"
            className="h-10 rounded-lg"
            {...register('name', { required: 'Vui lòng nhập tên' })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        <div>
          <label htmlFor="edit-style-niche" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Chủ đề
          </label>
          <Input
            id="edit-style-niche"
            className="h-10 rounded-lg"
            {...register('niche', { required: 'Vui lòng nhập chủ đề' })}
          />
          {errors.niche ? <p className="mt-1 text-xs text-danger">{errors.niche.message}</p> : null}
        </div>

        <div>
          <label htmlFor="edit-style-rule" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Quy tắc
          </label>
          <Textarea id="edit-style-rule" rows={6} className="text-sm" {...register('rule', { required: 'Vui lòng nhập quy tắc' })} />
          {errors.rule ? <p className="mt-1 text-xs text-danger">{errors.rule.message}</p> : null}
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
