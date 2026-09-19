import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { updateGpmGroup } from '../../api/gpm';
import type { EditGpmGroupFormValues, GpmGroup } from '../../types/gpm';
import { Button, Input, Modal } from '../ui';

interface EditGpmGroupModalProps {
  open: boolean;
  group: GpmGroup | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditGpmGroupModal({ open, group, onClose, onSuccess }: EditGpmGroupModalProps) {
  const { t } = useTranslation(['browser', 'common']);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditGpmGroupFormValues>();

  useEffect(() => {
    if (!open || !group) return;
    reset({
      name: group.name,
      sort_order: String(group.sort_order ?? 0),
    });
    setApiError(null);
  }, [open, group, reset]);

  function handleClose() {
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: EditGpmGroupFormValues) {
    if (!group) return;
    setApiError(null);
    try {
      await updateGpmGroup(group.id, {
        name: values.name.trim(),
        sort_order: Number(values.sort_order) || 0,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : t('gpm.editGroup.error'));
    }
  }

  if (!group) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('gpm.editGroup.title')}
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={isSubmitting}
            form="edit-gpm-group-form"
            type="submit"
          >
            {isSubmitting ? t('gpm.editGroup.saving') : t('gpm.editGroup.save')}
          </Button>
        </>
      }
    >
      <form id="edit-gpm-group-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="edit-gpm-group-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('gpm.editGroup.name')}
          </label>
          <Input
            id="edit-gpm-group-name"
            className="h-10 rounded-lg text-sm"
            disabled={isSubmitting}
            {...register('name', { required: t('gpm.editGroup.nameRequired') })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        <div>
          <label htmlFor="edit-gpm-group-sort" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('gpm.editGroup.sortOrder')}
          </label>
          <Input
            id="edit-gpm-group-sort"
            type="number"
            className="h-10 rounded-lg text-sm"
            disabled={isSubmitting}
            {...register('sort_order')}
          />
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
