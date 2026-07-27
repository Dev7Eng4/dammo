import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { createChromeProfile } from '../../api/chromeProfiles';
import type { AddChromeProfileFormValues } from '../../types/chromeProfile';
import { Button, Input, Modal } from '../ui';

interface AddChromeProfileModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const defaultValues: AddChromeProfileFormValues = {
  name: '',
};

export function AddChromeProfileModal({ open, onClose, onSuccess }: AddChromeProfileModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddChromeProfileFormValues>({
    defaultValues,
  });

  function handleClose() {
    reset(defaultValues);
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: AddChromeProfileFormValues) {
    setApiError(null);
    try {
      await createChromeProfile({ name: values.name.trim() });
      reset(defaultValues);
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Không thể tạo profile');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Thêm Chrome profile"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={isSubmitting}
            form="add-chrome-profile-form"
            type="submit"
          >
            {isSubmitting ? 'Đang tạo...' : 'Thêm profile'}
          </Button>
        </>
      }
    >
      <form id="add-chrome-profile-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="profile-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Tên profile
          </label>
          <Input
            id="profile-name"
            placeholder="vd. Kênh A"
            className="h-10 rounded-lg text-sm"
            disabled={isSubmitting}
            {...register('name', { required: 'Vui lòng nhập tên' })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}

        <p className="text-xs text-neutral-500">
          Profile Playwright Chromium sẽ được khởi tạo trên server với thư mục user data riêng.
        </p>
      </form>
    </Modal>
  );
}
