import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { createMailAccount, updateMailAccount } from '../../api/mailAccounts';
import { Button, Input, Modal } from '../ui';
import type { AddMailFormValues, MailAccount } from '../../types/mailAccount';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AddMailModalProps {
  open: boolean;
  account?: MailAccount | null;
  onClose: () => void;
  onSuccess: () => void;
}

function toFormValues(account?: MailAccount | null): AddMailFormValues {
  if (!account) {
    return { email: '', password: '', twoFactorAuth: '', recoveryEmail: '', phone: '' };
  }

  return {
    email: account.email,
    password: account.password ?? '',
    twoFactorAuth: account.twoFactorAuth ?? '',
    recoveryEmail: account.recoveryEmail ?? '',
    phone: account.phone ?? '',
  };
}

export function AddMailModal({ open, account = null, onClose, onSuccess }: AddMailModalProps) {
  const { t } = useTranslation(['mail', 'common']);
  const isEdit = Boolean(account);
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddMailFormValues>({
    defaultValues: toFormValues(account),
  });

  useEffect(() => {
    if (!open) return;
    reset(toFormValues(account));
    setApiError(null);
  }, [open, account, reset]);

  function handleClose() {
    reset(toFormValues());
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: AddMailFormValues) {
    setApiError(null);
    try {
      if (isEdit && account) {
        await updateMailAccount(account.id, values);
      } else {
        await createMailAccount(values);
      }
      reset(toFormValues());
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(
        err instanceof Error
          ? err.message
          : isEdit
            ? t('form.updateError')
            : t('form.createError'),
      );
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEdit ? t('form.editTitle') : t('form.addTitle')}
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button size="sm" className="rounded-lg" disabled={isSubmitting} form="add-mail-form" type="submit">
            {isSubmitting
              ? t('common:actions.saving')
              : isEdit
                ? t('common:actions.save')
                : t('form.add')}
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
              required: t('form.emailRequired'),
              pattern: { value: EMAIL_PATTERN, message: t('form.emailInvalid') },
            })}
          />
          {errors.email ? (
            <p className="mt-1 text-xs text-danger">{errors.email.message}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('form.password')} <span className="text-neutral-500">{t('common:actions.optional')}</span>
          </label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            className="h-10 rounded-lg"
            {...register('password', {
              minLength: { value: 6, message: t('form.passwordMin') },
            })}
          />
          {errors.password ? (
            <p className="mt-1 text-xs text-danger">{errors.password.message}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="twoFactorAuth" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('form.twoFa')} <span className="text-neutral-500">{t('common:actions.optional')}</span>
          </label>
          <Input
            id="twoFactorAuth"
            type="text"
            placeholder={t('form.twoFaPlaceholder')}
            className="h-10 rounded-lg"
            {...register('twoFactorAuth')}
          />
        </div>

        <div>
          <label htmlFor="recoveryEmail" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('form.recovery')} <span className="text-neutral-500">{t('common:actions.optional')}</span>
          </label>
          <Input
            id="recoveryEmail"
            type="email"
            placeholder="recovery@example.com"
            className="h-10 rounded-lg"
            {...register('recoveryEmail', {
              pattern: { value: EMAIL_PATTERN, message: t('form.emailInvalid') },
            })}
          />
          {errors.recoveryEmail ? (
            <p className="mt-1 text-xs text-danger">{errors.recoveryEmail.message}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="phone" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('form.phone')} <span className="text-neutral-500">{t('common:actions.optional')}</span>
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
