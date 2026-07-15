import { useForm } from 'react-hook-form';
import { useState, useEffect } from 'react';
import { createProxy, fetchProxyProviders } from '../../api/proxies';
import { Button, DropdownSelect, Input, Modal } from '../ui';
import type { ProxyFormValues, ProxyProvider, ProxyType } from '../../types/proxy';

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

/** Parse chuỗi dạng host:port:user:pass hoặc host:port */
function parseHostString(raw: string): { host: string; port?: number; username?: string; password?: string } | null {
  const parts = raw.trim().split(':');
  if (parts.length === 4) {
    const port = Number(parts[1]);
    return {
      host: parts[0] ?? '',
      port: Number.isNaN(port) ? undefined : port,
      username: parts[2] ?? '',
      password: parts[3] ?? '',
    };
  }
  if (parts.length === 2) {
    const port = Number(parts[1]);
    return {
      host: parts[0] ?? '',
      port: Number.isNaN(port) ? undefined : port,
    };
  }
  return null;
}

export function AddProxyModal({ open, onClose, onSuccess }: AddProxyModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProxyProvider[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProxyFormValues>({
    defaultValues: {
      type: 'http',
      host: '',
      port: '',
      username: '',
      password: '',
      countryCode: 'VN',
      providerId: '',
      expiresAt: '',
    },
  });

  const proxyType = watch('type');
  const providerId = watch('providerId');

  // Fetch providers khi modal mở
  useEffect(() => {
    if (!open) return;
    fetchProxyProviders()
      .then(res => setProviders(res.items))
      .catch(() => setProviders([]));
  }, [open]);

  function handleClose() {
    reset();
    setApiError(null);
    onClose();
  }

  /** Nếu user paste dạng host:port:user:pass vào ô Host, tự điền các field còn lại */
  function handleHostBlur(e: React.FocusEvent<HTMLInputElement>) {
    const raw = e.target.value.trim();
    const parsed = parseHostString(raw);
    if (!parsed) return;
    // Chỉ auto-fill nếu raw chứa dấu ":"
    if (!raw.includes(':')) return;
    setValue('host', parsed.host, { shouldValidate: true });
    if (parsed.port !== undefined) setValue('port', parsed.port, { shouldValidate: true });
    if (parsed.username !== undefined) setValue('username', parsed.username);
    if (parsed.password !== undefined) setValue('password', parsed.password);
  }

  const providerOptions = [{ value: '', label: '— None —' }, ...providers.map(p => ({ value: p.id, label: p.name }))];

  async function onSubmit(values: ProxyFormValues) {
    setApiError(null);
    const selectedProvider = providers.find(p => p.id === values.providerId);
    try {
      await createProxy({
        name: `${values.host}:${values.port}`,
        type: values.type,
        host: values.host,
        port: Number(values.port),
        username: values.username?.trim() || undefined,
        password: values.password?.trim() || undefined,
        countryCode: values.countryCode?.trim() || undefined,
        provider: selectedProvider?.name || undefined,
        expiresAt: values.expiresAt?.trim() || undefined,
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
      title='Add Proxy'
      footer={
        <>
          <Button variant='outlined' size='sm' className='rounded-lg' onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button size='sm' className='rounded-lg' disabled={isSubmitting} form='add-proxy-form' type='submit'>
            {isSubmitting ? 'Saving...' : 'Add Proxy'}
          </Button>
        </>
      }
    >
      <form id='add-proxy-form' onSubmit={handleSubmit(onSubmit)} className='space-y-4' autoComplete='off'>
        {/* Type */}
        <div>
          <label className='mb-1.5 block text-xs font-medium text-neutral-400'>Type</label>
          <DropdownSelect options={typeOptions} value={proxyType} onChange={value => setValue('type', value)} menuClassName='w-full' />
        </div>

        {/* Host — hỗ trợ nhập dạng host:port:user:pass */}
        <div className='grid grid-cols-3 gap-3'>
          <div className='col-span-2'>
            <label htmlFor='add-host' className='mb-1.5 block text-xs font-medium text-neutral-400'>
              Host <span className='text-neutral-500'>(or host:port:user:pass)</span>
            </label>
            <Input
              id='add-host'
              placeholder='117.0.182.133:11451:user:pass'
              className='h-10 rounded-lg font-mono'
              autoComplete='off'
              {...register('host', { required: 'Host is required' })}
              onBlur={handleHostBlur}
            />
            {errors.host ? <p className='mt-1 text-xs text-danger'>{errors.host.message}</p> : null}
          </div>
          <div>
            <label htmlFor='add-port' className='mb-1.5 block text-xs font-medium text-neutral-400'>
              Port
            </label>
            <Input
              id='add-port'
              type='text'
              className='h-10 rounded-lg'
              autoComplete='off'
              {...register('port', {
                required: 'Port is required',
                min: { value: 1, message: 'Invalid port' },
                max: { value: 65535, message: 'Invalid port' },
              })}
            />
            {errors.port ? <p className='mt-1 text-xs text-danger'>{errors.port.message}</p> : null}
          </div>
        </div>

        {/* Username / Password */}
        <div className='grid grid-cols-2 gap-3'>
          <div>
            <label htmlFor='add-username' className='mb-1.5 block text-xs font-medium text-neutral-400'>
              Username <span className='text-neutral-500'>(optional)</span>
            </label>
            <Input id='add-username' className='h-10 rounded-lg' autoComplete='off' {...register('username')} />
          </div>
          <div>
            <label htmlFor='add-password' className='mb-1.5 block text-xs font-medium text-neutral-400'>
              Password <span className='text-neutral-500'>(optional)</span>
            </label>
            <Input id='add-password' type='password' className='h-10 rounded-lg' autoComplete='new-password' {...register('password')} />
          </div>
        </div>

        {/* Country Code */}
        <div>
          <label htmlFor='add-countryCode' className='mb-1.5 block text-xs font-medium text-neutral-400'>
            Country Code
          </label>
          <Input id='add-countryCode' placeholder='VN' className='h-10 rounded-lg uppercase' {...register('countryCode')} />
        </div>

        {/* Provider — select từ danh sách providers */}
        <div>
          <label className='mb-1.5 block text-xs font-medium text-neutral-400'>Provider</label>
          <DropdownSelect
            options={providerOptions}
            value={providerId ?? ''}
            onChange={value => setValue('providerId', value)}
            menuClassName='w-full'
          />
        </div>

        {/* Ngày hết hạn */}
        <div>
          <label htmlFor='add-expiresAt' className='mb-1.5 block text-xs font-medium text-neutral-400'>
            Ngày hết hạn <span className='text-neutral-500'>(optional)</span>
          </label>
          <Input id='add-expiresAt' type='date' className='h-10 rounded-lg' {...register('expiresAt')} />
        </div>

        {apiError ? <p className='text-xs text-danger'>{apiError}</p> : null}
      </form>
    </Modal>
  );
}
