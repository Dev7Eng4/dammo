import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
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
      setApiError(err instanceof Error ? err.message : 'Failed to update group');
    }
  }

  if (!group) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Edit GPM Group"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={isSubmitting}
            form="edit-gpm-group-form"
            type="submit"
          >
            {isSubmitting ? 'Saving…' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <form id="edit-gpm-group-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="edit-gpm-group-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Name
          </label>
          <Input
            id="edit-gpm-group-name"
            className="h-10 rounded-lg text-sm"
            disabled={isSubmitting}
            {...register('name', { required: 'Name is required' })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        <div>
          <label htmlFor="edit-gpm-group-sort" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Sort order
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
