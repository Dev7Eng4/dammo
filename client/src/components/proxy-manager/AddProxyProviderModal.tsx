import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { createProxyProvider } from '../../api/proxies';
import { Button, Input, Modal, Textarea } from '../ui';
import type { ProxyProviderFormValues } from '../../types/proxy';

interface AddProxyProviderModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddProxyProviderModal({ open, onClose, onSuccess }: AddProxyProviderModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProxyProviderFormValues>({
    defaultValues: {
      name: '',
      loginUrl: '',
      username: '',
      password: '',
      notes: '',
    },
  });

  function handleClose() {
    reset();
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: ProxyProviderFormValues) {
    setApiError(null);
    try {
      await createProxyProvider({
        name: values.name,
        loginUrl: values.loginUrl?.trim() || undefined,
        username: values.username,
        password: values.password,
        notes: values.notes?.trim() || undefined,
      });
      reset();
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Tạo nhà cung cấp thất bại');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Thêm nhà cung cấp"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button size="sm" className="rounded-lg" disabled={isSubmitting} form="add-provider-form" type="submit">
            {isSubmitting ? 'Đang lưu...' : 'Thêm nhà cung cấp'}
          </Button>
        </>
      }
    >
      <form id="add-provider-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="provider-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Tên nhà cung cấp
          </label>
          <Input
            id="provider-name"
            placeholder="Luminati Network"
            className="h-10 rounded-lg"
            {...register('name', { required: 'Tên là bắt buộc' })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        <div>
          <label htmlFor="provider-url" className="mb-1.5 block text-xs font-medium text-neutral-400">
            URL đăng nhập <span className="text-neutral-500">(tùy chọn)</span>
          </label>
          <Input
            id="provider-url"
            type="url"
            placeholder="https://brightdata.com/cp/start"
            className="h-10 rounded-lg"
            {...register('loginUrl', {
              pattern: {
                value: /^$|^https?:\/\/.+/i,
                message: 'URL phải bắt đầu bằng http:// hoặc https://',
              },
            })}
          />
          {errors.loginUrl ? <p className="mt-1 text-xs text-danger">{errors.loginUrl.message}</p> : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="provider-username" className="mb-1.5 block text-xs font-medium text-neutral-400">
              Tên đăng nhập
            </label>
            <Input
              id="provider-username"
              className="h-10 rounded-lg"
              {...register('username', { required: 'Tên đăng nhập là bắt buộc' })}
            />
            {errors.username ? (
              <p className="mt-1 text-xs text-danger">{errors.username.message}</p>
            ) : null}
          </div>
          <div>
            <label htmlFor="provider-password" className="mb-1.5 block text-xs font-medium text-neutral-400">
              Mật khẩu
            </label>
            <Input
              id="provider-password"
              type="password"
              className="h-10 rounded-lg"
              {...register('password', { required: 'Mật khẩu là bắt buộc' })}
            />
            {errors.password ? (
              <p className="mt-1 text-xs text-danger">{errors.password.message}</p>
            ) : null}
          </div>
        </div>

        <div>
          <label htmlFor="provider-notes" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Ghi chú <span className="text-neutral-500">(tùy chọn)</span>
          </label>
          <Textarea id="provider-notes" rows={3} className="text-sm" {...register('notes')} />
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
