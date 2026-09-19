import { useForm } from 'react-hook-form';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

/** Parse host:port:user:pass or host:port */
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
  const { t } = useTranslation(['browser', 'common']);
  const [apiError, setApiError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProxyProvider[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProxyFormValues>({
    defaultValues: {
      type: 'http',
      rawProxy: '',
      countryCode: 'VN',
      providerId: '',
      expiresAt: '',
    },
  });

  const proxyType = watch('type');
  const providerId = watch('providerId');

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

  const providerOptions = [
    { value: '', label: t('proxy.add.noProvider') },
    ...providers.map(p => ({ value: p.id, label: p.name })),
  ];

  async function onSubmit(values: ProxyFormValues) {
    setApiError(null);
    const parsed = parseHostString(values.rawProxy);
    if (!parsed?.host || parsed.port === undefined) {
      setError('rawProxy', {
        type: 'validate',
        message: t('proxy.add.rawProxyInvalid'),
      });
      return;
    }
    if (parsed.port < 1 || parsed.port > 65535) {
      setError('rawProxy', {
        type: 'validate',
        message: t('proxy.add.portInvalid'),
      });
      return;
    }

    const selectedProvider = providers.find(p => p.id === values.providerId);
    try {
      await createProxy({
        name: `${parsed.host}:${parsed.port}`,
        type: values.type,
        host: parsed.host,
        port: parsed.port,
        username: parsed.username?.trim() || undefined,
        password: parsed.password?.trim() || undefined,
        countryCode: values.countryCode?.trim() || undefined,
        provider: selectedProvider?.name || undefined,
        expiresAt: values.expiresAt?.trim() || undefined,
      });
      reset();
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : t('proxy.add.error'));
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('proxy.add.title')}
      footer={
        <>
          <Button variant='outlined' size='sm' className='rounded-lg' onClick={handleClose} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button size='sm' className='rounded-lg' disabled={isSubmitting} form='add-proxy-form' type='submit'>
            {isSubmitting ? t('common:actions.saving') : t('proxy.add.submit')}
          </Button>
        </>
      }
    >
      <form id='add-proxy-form' onSubmit={handleSubmit(onSubmit)} className='space-y-4' autoComplete='off'>
        <div className='flex gap-4'>
          <div className='w-1/2'>
            <label className='mb-1.5 block text-xs font-medium text-neutral-400'>{t('proxy.add.type')}</label>
            <DropdownSelect options={typeOptions} value={proxyType} onChange={value => setValue('type', value)} menuClassName='w-full' />
          </div>

          <div className='w-1/2'>
            <label className='mb-1.5 block text-xs font-medium text-neutral-400'>{t('proxy.add.provider')}</label>
            <DropdownSelect
              options={providerOptions}
              value={providerId ?? ''}
              onChange={value => setValue('providerId', value)}
              menuClassName='w-full'
            />
          </div>
        </div>

        <div>
          <label htmlFor='add-rawProxy' className='mb-1.5 block text-xs font-medium text-neutral-400'>
            {t('proxy.add.rawProxy')} <span className='text-neutral-500'>{t('proxy.add.rawProxyHint')}</span>
          </label>
          <Input
            id='add-rawProxy'
            placeholder='14.241.72.128:40520:pSqLjT:aiFfFX'
            className='h-10 rounded-lg font-mono'
            autoComplete='off'
            {...register('rawProxy', { required: t('proxy.add.rawProxyRequired') })}
          />
          {errors.rawProxy ? <p className='mt-1 text-xs text-danger'>{errors.rawProxy.message}</p> : null}
        </div>

        <div>
          <label htmlFor='add-countryCode' className='mb-1.5 block text-xs font-medium text-neutral-400'>
            {t('proxy.add.countryCode')}
          </label>
          <Input id='add-countryCode' placeholder='VN' className='h-10 rounded-lg uppercase' {...register('countryCode')} />
        </div>

        <div>
          <label htmlFor='add-expiresAt' className='mb-1.5 block text-xs font-medium text-neutral-400'>
            {t('proxy.add.expiresAt')} <span className='text-neutral-500'>{t('proxy.add.expiresOptional')}</span>
          </label>
          <Input id='add-expiresAt' type='date' className='h-10 rounded-lg' {...register('expiresAt')} />
        </div>

        {apiError ? <p className='text-xs text-danger'>{apiError}</p> : null}
      </form>
    </Modal>
  );
}
