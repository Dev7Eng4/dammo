import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createCelebrity } from '../../api/celebrities';
import { Button, Input, Modal, Textarea } from '../ui';
import type { CelebrityFormValues } from '../../types/celebrity';

interface AddCelebrityModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddCelebrityModal({ open, onClose, onSuccess }: AddCelebrityModalProps) {
  const { t } = useTranslation(['content', 'common']);
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CelebrityFormValues>({
    defaultValues: {
      name: '',
      note: '',
    },
  });

  function handleClose() {
    reset();
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: CelebrityFormValues) {
    setApiError(null);
    try {
      await createCelebrity({
        name: values.name,
        note: values.note.trim() || undefined,
      });
      reset();
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : t('assets.celebrities.createError'));
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('assets.celebrities.addTitle')}
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button size="sm" className="rounded-lg" disabled={isSubmitting} form="add-celebrity-form" type="submit">
            {isSubmitting ? t('common:actions.saving') : t('assets.celebrities.addSubmit')}
          </Button>
        </>
      }
    >
      <form id="add-celebrity-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="celebrity-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('assets.celebrities.name')}
          </label>
          <Input
            id="celebrity-name"
            placeholder={t('assets.celebrities.namePlaceholder')}
            className="h-10 rounded-lg"
            {...register('name', { required: t('assets.celebrities.nameRequired') })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        <div>
          <label htmlFor="celebrity-note" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('assets.celebrities.noteOptional')}
          </label>
          <Textarea
            id="celebrity-note"
            rows={3}
            placeholder={t('assets.celebrities.notePlaceholder')}
            className="text-sm"
            {...register('note')}
          />
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
