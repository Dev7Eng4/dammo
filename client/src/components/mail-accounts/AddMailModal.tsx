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
    defaultValues: { email: '', password: '', recoveryEmail: '' },
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
      setApiError(err instanceof Error ? err.message : 'Failed to create account');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Mail Account"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button size="sm" className="rounded-lg" disabled={isSubmitting} form="add-mail-form" type="submit">
            {isSubmitting ? 'Saving...' : 'Add Mail'}
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
              required: 'Email is required',
              pattern: { value: EMAIL_PATTERN, message: 'Invalid email address' },
            })}
          />
          {errors.email ? (
            <p className="mt-1 text-xs text-danger">{errors.email.message}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Password <span className="text-neutral-500">(optional)</span>
          </label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            className="h-10 rounded-lg"
            {...register('password', {
              minLength: { value: 6, message: 'Password must be at least 6 characters' },
            })}
          />
          {errors.password ? (
            <p className="mt-1 text-xs text-danger">{errors.password.message}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="recoveryEmail" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Mail khôi phục <span className="text-neutral-500">(optional)</span>
          </label>
          <Input
            id="recoveryEmail"
            type="email"
            placeholder="recovery@example.com"
            className="h-10 rounded-lg"
            {...register('recoveryEmail', {
              pattern: { value: EMAIL_PATTERN, message: 'Invalid email address' },
            })}
          />
          {errors.recoveryEmail ? (
            <p className="mt-1 text-xs text-danger">{errors.recoveryEmail.message}</p>
          ) : null}
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
