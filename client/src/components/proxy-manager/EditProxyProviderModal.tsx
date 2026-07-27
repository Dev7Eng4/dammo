import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { updateProxyProvider } from '../../api/proxies';
import { Button, Input, Modal, Textarea } from '../ui';
import type { ProxyProvider, ProxyProviderFormValues } from '../../types/proxy';

interface EditProxyProviderModalProps {
  open: boolean;
  provider: ProxyProvider | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditProxyProviderModal({
  open,
  provider,
  onClose,
  onSuccess,
}: EditProxyProviderModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProxyProviderFormValues>();

  useEffect(() => {
    if (!provider) return;
    reset({
      name: provider.name,
      loginUrl: provider.loginUrl,
      username: provider.username,
      password: '',
      notes: provider.notes ?? '',
    });
  }, [provider, reset]);

  function handleClose() {
    reset();
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: ProxyProviderFormValues) {
    if (!provider) return;
    setApiError(null);
    try {
      await updateProxyProvider(provider.id, {
        name: values.name,
        loginUrl: values.loginUrl?.trim() || undefined,
        username: values.username,
        password: values.password.trim() ? values.password : undefined,
        notes: values.notes?.trim() || null,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Cập nhật nhà cung cấp thất bại');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Sửa nhà cung cấp"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={isSubmitting || !provider}
            form="edit-provider-form"
            type="submit"
          >
            {isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
          </Button>
        </>
      }
    >
      <form id="edit-provider-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="edit-provider-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Tên nhà cung cấp
          </label>
          <Input
            id="edit-provider-name"
            className="h-10 rounded-lg"
            {...register('name', { required: 'Tên là bắt buộc' })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        <div>
          <label htmlFor="edit-provider-url" className="mb-1.5 block text-xs font-medium text-neutral-400">
            URL đăng nhập <span className="text-neutral-500">(tùy chọn)</span>
          </label>
          <Input
            id="edit-provider-url"
            type="url"
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
            <label htmlFor="edit-provider-username" className="mb-1.5 block text-xs font-medium text-neutral-400">
              Tên đăng nhập
            </label>
            <Input
              id="edit-provider-username"
              className="h-10 rounded-lg"
              {...register('username', { required: 'Tên đăng nhập là bắt buộc' })}
            />
            {errors.username ? (
              <p className="mt-1 text-xs text-danger">{errors.username.message}</p>
            ) : null}
          </div>
          <div>
            <label htmlFor="edit-provider-password" className="mb-1.5 block text-xs font-medium text-neutral-400">
              Mật khẩu mới
            </label>
            <Input
              id="edit-provider-password"
              type="password"
              placeholder="Để trống nếu giữ nguyên"
              className="h-10 rounded-lg"
              {...register('password')}
            />
          </div>
        </div>

        <div>
          <label htmlFor="edit-provider-notes" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Ghi chú
          </label>
          <Textarea id="edit-provider-notes" rows={3} className="text-sm" {...register('notes')} />
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
