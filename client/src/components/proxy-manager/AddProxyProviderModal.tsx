import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createProxyProvider } from '../../api/proxies';
import { Button, Input, Modal, Textarea } from '../ui';
import type { ProxyProviderFormValues } from '../../types/proxy';

interface AddProxyProviderModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddProxyProviderModal({ open, onClose, onSuccess }: AddProxyProviderModalProps) {
  const { t } = useTranslation(['browser', 'common']);
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
      setApiError(err instanceof Error ? err.message : t('proxy.providers.addModal.error'));
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('proxy.providers.addModal.title')}
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button size="sm" className="rounded-lg" disabled={isSubmitting} form="add-provider-form" type="submit">
            {isSubmitting ? t('common:actions.saving') : t('proxy.providers.addModal.submit')}
          </Button>
        </>
      }
    >
      <form id="add-provider-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="provider-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('proxy.providers.addModal.name')}
          </label>
          <Input
            id="provider-name"
            placeholder="Luminati Network"
            className="h-10 rounded-lg"
            {...register('name', { required: t('proxy.providers.addModal.nameRequired') })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        <div>
          <label htmlFor="provider-url" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('proxy.providers.addModal.loginUrl')}{' '}
            <span className="text-neutral-500">{t('proxy.providers.addModal.loginUrlOptional')}</span>
          </label>
          <Input
            id="provider-url"
            type="url"
            placeholder="https://brightdata.com/cp/start"
            className="h-10 rounded-lg"
            {...register('loginUrl', {
              pattern: {
                value: /^$|^https?:\/\/.+/i,
                message: t('proxy.providers.addModal.loginUrlInvalid'),
              },
            })}
          />
          {errors.loginUrl ? <p className="mt-1 text-xs text-danger">{errors.loginUrl.message}</p> : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="provider-username" className="mb-1.5 block text-xs font-medium text-neutral-400">
              {t('proxy.providers.addModal.username')}
            </label>
            <Input
              id="provider-username"
              className="h-10 rounded-lg"
              {...register('username', { required: t('proxy.providers.addModal.usernameRequired') })}
            />
            {errors.username ? (
              <p className="mt-1 text-xs text-danger">{errors.username.message}</p>
            ) : null}
          </div>
          <div>
            <label htmlFor="provider-password" className="mb-1.5 block text-xs font-medium text-neutral-400">
              {t('proxy.providers.addModal.password')}
            </label>
            <Input
              id="provider-password"
              type="password"
              className="h-10 rounded-lg"
              {...register('password', { required: t('proxy.providers.addModal.passwordRequired') })}
            />
            {errors.password ? (
              <p className="mt-1 text-xs text-danger">{errors.password.message}</p>
            ) : null}
          </div>
        </div>

        <div>
          <label htmlFor="provider-notes" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('proxy.providers.addModal.notes')}{' '}
            <span className="text-neutral-500">{t('proxy.providers.addModal.notesOptional')}</span>
          </label>
          <Textarea id="provider-notes" rows={3} className="text-sm" {...register('notes')} />
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
