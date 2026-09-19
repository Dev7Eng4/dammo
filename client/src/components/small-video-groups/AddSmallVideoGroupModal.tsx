import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createSmallVideoGroup } from '../../api/small-video-groups';
import { Button, Input, Modal, Textarea } from '../ui';
import type { SmallVideoGroupFormValues } from '../../types/smallVideoGroup';

interface AddSmallVideoGroupModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddSmallVideoGroupModal({ open, onClose, onSuccess }: AddSmallVideoGroupModalProps) {
  const { t } = useTranslation(['content', 'common']);
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SmallVideoGroupFormValues>({
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

  async function onSubmit(values: SmallVideoGroupFormValues) {
    setApiError(null);
    try {
      await createSmallVideoGroup({
        name: values.name,
        note: values.note.trim() || undefined,
      });
      reset();
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : t('assets.smallVideo.createError'));
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('assets.smallVideo.addGroupTitle')}
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button size="sm" className="rounded-lg" disabled={isSubmitting} form="add-small-video-group-form" type="submit">
            {isSubmitting ? t('common:actions.saving') : t('assets.smallVideo.addSubmit')}
          </Button>
        </>
      }
    >
      <form id="add-small-video-group-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="small-video-group-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('assets.smallVideo.groupName')}
          </label>
          <Input
            id="small-video-group-name"
            placeholder={t('assets.smallVideo.groupNamePlaceholder')}
            className="h-10 rounded-lg"
            {...register('name', { required: t('assets.smallVideo.groupNameRequired') })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        <div>
          <label htmlFor="small-video-group-note" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('assets.smallVideo.noteOptional')}
          </label>
          <Textarea
            id="small-video-group-note"
            rows={3}
            placeholder={t('assets.smallVideo.notePlaceholder')}
            className="text-sm"
            {...register('note')}
          />
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
