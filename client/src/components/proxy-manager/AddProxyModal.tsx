import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { createProxy } from '../../api/proxies';
import { Button, DropdownSelect, Input, Modal } from '../ui';
import type { ProxyFormValues, ProxyType } from '../../types/proxy';

interface AddProxyModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const typeOptions: { value: ProxyType; label: string }[] = [
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
  { value: 'socks5', label: 'SOCKS5' },
];

export function AddProxyModal({ open, onClose, onSuccess }: AddProxyModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProxyFormValues>({
    defaultValues: {
      name: '',
      type: 'http',
      host: '',
      port: 8080,
      username: '',
      password: '',
      location: '',
      countryCode: '',
      provider: '',
      tags: '',
    },
  });

  const proxyType = watch('type');

  function handleClose() {
    reset();
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: ProxyFormValues) {
    setApiError(null);
    try {
      await createProxy({
        name: values.name,
        type: values.type,
        host: values.host,
        port: Number(values.port),
        username: values.username?.trim() || undefined,
        password: values.password?.trim() || undefined,
        location: values.location?.trim() || undefined,
        countryCode: values.countryCode?.trim() || undefined,
        provider: values.provider?.trim() || undefined,
        tags: values.tags
          ?.split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      reset();
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to create proxy');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Proxy"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button size="sm" className="rounded-lg" disabled={isSubmitting} form="add-proxy-form" type="submit">
            {isSubmitting ? 'Saving...' : 'Add Proxy'}
          </Button>
        </>
      }
    >
      <form id="add-proxy-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="add-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Proxy Name
          </label>
          <Input
            id="add-name"
            placeholder="US-East-DC-01"
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
            <label htmlFor="add-host" className="mb-1.5 block text-xs font-medium text-neutral-400">
              Host
            </label>
            <Input
              id="add-host"
              placeholder="192.168.1.105"
              className="h-10 rounded-lg font-mono"
              {...register('host', { required: 'Host is required' })}
            />
            {errors.host ? <p className="mt-1 text-xs text-danger">{errors.host.message}</p> : null}
          </div>
          <div>
            <label htmlFor="add-port" className="mb-1.5 block text-xs font-medium text-neutral-400">
              Port
            </label>
            <Input
              id="add-port"
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
            <label htmlFor="add-username" className="mb-1.5 block text-xs font-medium text-neutral-400">
              Username <span className="text-neutral-500">(optional)</span>
            </label>
            <Input id="add-username" className="h-10 rounded-lg" {...register('username')} />
          </div>
          <div>
            <label htmlFor="add-password" className="mb-1.5 block text-xs font-medium text-neutral-400">
              Password <span className="text-neutral-500">(optional)</span>
            </label>
            <Input id="add-password" type="password" className="h-10 rounded-lg" {...register('password')} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="add-location" className="mb-1.5 block text-xs font-medium text-neutral-400">
              Location
            </label>
            <Input id="add-location" placeholder="US, Ashburn" className="h-10 rounded-lg" {...register('location')} />
          </div>
          <div>
            <label htmlFor="add-countryCode" className="mb-1.5 block text-xs font-medium text-neutral-400">
              Country Code
            </label>
            <Input id="add-countryCode" placeholder="US" className="h-10 rounded-lg uppercase" {...register('countryCode')} />
          </div>
        </div>

        <div>
          <label htmlFor="add-provider" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Provider
          </label>
          <Input id="add-provider" placeholder="Luminati Network" className="h-10 rounded-lg" {...register('provider')} />
        </div>

        <div>
          <label htmlFor="add-tags" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Tags <span className="text-neutral-500">(comma-separated)</span>
          </label>
          <Input id="add-tags" placeholder="datacenter, fast" className="h-10 rounded-lg" {...register('tags')} />
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
