import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { updateChromeProfile } from '../../api/chromeProfiles';
import type { ChromeProfile, EditChromeProfileFormValues } from '../../types/chromeProfile';
import { Button, Input, Modal } from '../ui';

interface EditChromeProfileModalProps {
  open: boolean;
  profile: ChromeProfile | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditChromeProfileModal({
  open,
  profile,
  onClose,
  onSuccess,
}: EditChromeProfileModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditChromeProfileFormValues>();

  useEffect(() => {
    if (!profile) return;
    reset({ name: profile.name });
  }, [profile, reset]);

  function handleClose() {
    reset();
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: EditChromeProfileFormValues) {
    if (!profile) return;
    setApiError(null);
    try {
      await updateChromeProfile(profile.id, { name: values.name.trim() });
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Không thể cập nhật tên profile');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Sửa tên Chrome profile"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={isSubmitting || !profile}
            form="edit-chrome-profile-form"
            type="submit"
          >
            {isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
          </Button>
        </>
      }
    >
      <form id="edit-chrome-profile-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="edit-profile-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Tên profile
          </label>
          <Input
            id="edit-profile-name"
            placeholder="vd. Kênh A"
            className="h-10 rounded-lg text-sm"
            disabled={isSubmitting}
            {...register('name', { required: 'Vui lòng nhập tên' })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
