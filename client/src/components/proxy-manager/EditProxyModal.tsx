import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { updateProxy } from '../../api/proxies';
import { Button, DropdownSelect, Input, Modal } from '../ui';
import type { EditProxyFormValues, Proxy, ProxyType } from '../../types/proxy';

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
  const { t } = useTranslation(['browser', 'common']);
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EditProxyFormValues>();

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

  async function onSubmit(values: EditProxyFormValues) {
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
      setApiError(err instanceof Error ? err.message : t('proxy.edit.error'));
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('proxy.edit.title')}
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button size="sm" className="rounded-lg" disabled={isSubmitting || !proxy} form="edit-proxy-form" type="submit">
            {isSubmitting ? t('common:actions.saving') : t('proxy.edit.save')}
          </Button>
        </>
      }
    >
      <form id="edit-proxy-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="edit-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('proxy.edit.name')}
          </label>
          <Input
            id="edit-name"
            className="h-10 rounded-lg"
            {...register('name', { required: t('proxy.edit.nameRequired') })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-neutral-400">{t('proxy.edit.type')}</label>
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
              {t('proxy.edit.host')}
            </label>
            <Input
              id="edit-host"
              className="h-10 rounded-lg font-mono"
              {...register('host', { required: t('proxy.edit.hostRequired') })}
            />
            {errors.host ? <p className="mt-1 text-xs text-danger">{errors.host.message}</p> : null}
          </div>
          <div>
            <label htmlFor="edit-port" className="mb-1.5 block text-xs font-medium text-neutral-400">
              {t('proxy.edit.port')}
            </label>
            <Input
              id="edit-port"
              type="number"
              className="h-10 rounded-lg"
              {...register('port', {
                required: t('proxy.edit.portRequired'),
                min: { value: 1, message: t('proxy.edit.portInvalid') },
                max: { value: 65535, message: t('proxy.edit.portInvalid') },
              })}
            />
            {errors.port ? <p className="mt-1 text-xs text-danger">{errors.port.message}</p> : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="edit-username" className="mb-1.5 block text-xs font-medium text-neutral-400">
              {t('proxy.edit.username')}
            </label>
            <Input id="edit-username" className="h-10 rounded-lg" {...register('username')} />
          </div>
          <div>
            <label htmlFor="edit-password" className="mb-1.5 block text-xs font-medium text-neutral-400">
              {t('proxy.edit.password')}
            </label>
            <Input id="edit-password" type="password" className="h-10 rounded-lg" {...register('password')} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="edit-location" className="mb-1.5 block text-xs font-medium text-neutral-400">
              {t('proxy.edit.location')}
            </label>
            <Input id="edit-location" className="h-10 rounded-lg" {...register('location')} />
          </div>
          <div>
            <label htmlFor="edit-countryCode" className="mb-1.5 block text-xs font-medium text-neutral-400">
              {t('proxy.edit.countryCode')}
            </label>
            <Input id="edit-countryCode" className="h-10 rounded-lg uppercase" {...register('countryCode')} />
          </div>
        </div>

        <div>
          <label htmlFor="edit-provider" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('proxy.edit.provider')}
          </label>
          <Input id="edit-provider" className="h-10 rounded-lg" {...register('provider')} />
        </div>

        <div>
          <label htmlFor="edit-tags" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('proxy.edit.tags')} <span className="text-neutral-500">{t('proxy.edit.tagsHint')}</span>
          </label>
          <Input id="edit-tags" className="h-10 rounded-lg" {...register('tags')} />
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
