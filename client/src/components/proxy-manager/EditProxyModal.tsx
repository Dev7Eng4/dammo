import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { updateProxy } from '../../api/proxies';
import { Button, DropdownSelect, Input, Modal } from '../ui';
import type { Proxy, ProxyFormValues, ProxyType } from '../../types/proxy';

interface EditProxyModalProps {
  open: boolean;
  proxy: Proxy | null;
  onClose: () => void;
  onSuccess: () => void;
}

const typeOptions: { value: ProxyType; label: string }[] = [
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
  { value: 'socks5', label: 'SOCKS5' },
];

export function EditProxyModal({ open, proxy, onClose, onSuccess }: EditProxyModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProxyFormValues>();

  const proxyType = watch('type');

  useEffect(() => {
    if (!proxy) return;
    reset({
      name: proxy.name,
      type: proxy.type,
      host: proxy.host,
      port: proxy.port,
      username: proxy.username ?? '',
      password: proxy.password ?? '',
      location: proxy.location ?? '',
      countryCode: proxy.countryCode ?? '',
      provider: proxy.provider ?? '',
      tags: (proxy.tags ?? []).join(', '),
    });
  }, [proxy, reset]);

  function handleClose() {
    reset();
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: ProxyFormValues) {
    if (!proxy) return;
    setApiError(null);
    try {
      await updateProxy(proxy.id, {
        name: values.name,
        type: values.type,
        host: values.host,
        port: Number(values.port),
        username: values.username?.trim() || null,
        password: values.password?.trim() || null,
        location: values.location?.trim() || null,
        countryCode: values.countryCode?.trim() || null,
        provider: values.provider?.trim() || null,
        tags: values.tags
          ?.split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to update proxy');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Edit Proxy"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button size="sm" className="rounded-lg" disabled={isSubmitting || !proxy} form="edit-proxy-form" type="submit">
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <form id="edit-proxy-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="edit-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Proxy Name
          </label>
          <Input
            id="edit-name"
            className="h-10 rounded-lg"
            {...register('name', { required: 'Name is required' })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-neutral-400">Type</label>
          <DropdownSelect
            options={typeOptions}
            value={proxyType}
            onChange={(value) => setValue('type', value)}
            menuClassName="w-full"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label htmlFor="edit-host" className="mb-1.5 block text-xs font-medium text-neutral-400">
              Host
            </label>
            <Input
              id="edit-host"
              className="h-10 rounded-lg font-mono"
              {...register('host', { required: 'Host is required' })}
            />
            {errors.host ? <p className="mt-1 text-xs text-danger">{errors.host.message}</p> : null}
          </div>
          <div>
            <label htmlFor="edit-port" className="mb-1.5 block text-xs font-medium text-neutral-400">
              Port
            </label>
            <Input
              id="edit-port"
              type="number"
              className="h-10 rounded-lg"
              {...register('port', {
                required: 'Port is required',
                min: { value: 1, message: 'Invalid port' },
                max: { value: 65535, message: 'Invalid port' },
              })}
            />
            {errors.port ? <p className="mt-1 text-xs text-danger">{errors.port.message}</p> : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="edit-username" className="mb-1.5 block text-xs font-medium text-neutral-400">
              Username
            </label>
            <Input id="edit-username" className="h-10 rounded-lg" {...register('username')} />
          </div>
          <div>
            <label htmlFor="edit-password" className="mb-1.5 block text-xs font-medium text-neutral-400">
              Password
            </label>
            <Input id="edit-password" type="password" className="h-10 rounded-lg" {...register('password')} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="edit-location" className="mb-1.5 block text-xs font-medium text-neutral-400">
              Location
            </label>
            <Input id="edit-location" className="h-10 rounded-lg" {...register('location')} />
          </div>
          <div>
            <label htmlFor="edit-countryCode" className="mb-1.5 block text-xs font-medium text-neutral-400">
              Country Code
            </label>
            <Input id="edit-countryCode" className="h-10 rounded-lg uppercase" {...register('countryCode')} />
          </div>
        </div>

        <div>
          <label htmlFor="edit-provider" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Provider
          </label>
          <Input id="edit-provider" className="h-10 rounded-lg" {...register('provider')} />
        </div>

        <div>
          <label htmlFor="edit-tags" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Tags <span className="text-neutral-500">(comma-separated)</span>
          </label>
          <Input id="edit-tags" className="h-10 rounded-lg" {...register('tags')} />
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
