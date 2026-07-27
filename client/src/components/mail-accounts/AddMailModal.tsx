import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { createMailAccount } from '../../api/mailAccounts';
import { Button, Input, Modal } from '../ui';
import type { AddMailFormValues } from '../../types/mailAccount';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AddMailModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddMailModal({ open, onClose, onSuccess }: AddMailModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddMailFormValues>({
    defaultValues: { email: '', password: '', twoFactorAuth: '', recoveryEmail: '', phone: '' },
  });

  function handleClose() {
    reset();
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: AddMailFormValues) {
    setApiError(null);
    try {
      await createMailAccount(values);
      reset();
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Không thể tạo tài khoản');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Thêm tài khoản email"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button size="sm" className="rounded-lg" disabled={isSubmitting} form="add-mail-form" type="submit">
            {isSubmitting ? 'Đang lưu...' : 'Thêm email'}
          </Button>
        </>
      }
    >
      <form id="add-mail-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Email
          </label>
          <Input
            id="email"
            type="email"
            placeholder="name@example.com"
            className="h-10 rounded-lg"
            {...register('email', {
              required: 'Vui lòng nhập email',
              pattern: { value: EMAIL_PATTERN, message: 'Email không hợp lệ' },
            })}
          />
          {errors.email ? (
            <p className="mt-1 text-xs text-danger">{errors.email.message}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Mật khẩu <span className="text-neutral-500">(tuỳ chọn)</span>
          </label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            className="h-10 rounded-lg"
            {...register('password', {
              minLength: { value: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự' },
            })}
          />
          {errors.password ? (
            <p className="mt-1 text-xs text-danger">{errors.password.message}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="twoFactorAuth" className="mb-1.5 block text-xs font-medium text-neutral-400">
            2FA <span className="text-neutral-500">(tuỳ chọn)</span>
          </label>
          <Input
            id="twoFactorAuth"
            type="text"
            placeholder="Mã dự phòng hoặc secret"
            className="h-10 rounded-lg"
            {...register('twoFactorAuth')}
          />
        </div>

        <div>
          <label htmlFor="recoveryEmail" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Email khôi phục <span className="text-neutral-500">(tuỳ chọn)</span>
          </label>
          <Input
            id="recoveryEmail"
            type="email"
            placeholder="recovery@example.com"
            className="h-10 rounded-lg"
            {...register('recoveryEmail', {
              pattern: { value: EMAIL_PATTERN, message: 'Email không hợp lệ' },
            })}
          />
          {errors.recoveryEmail ? (
            <p className="mt-1 text-xs text-danger">{errors.recoveryEmail.message}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="phone" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Số điện thoại <span className="text-neutral-500">(tuỳ chọn)</span>
          </label>
          <Input
            id="phone"
            type="tel"
            placeholder="+84..."
            className="h-10 rounded-lg"
            {...register('phone')}
          />
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
