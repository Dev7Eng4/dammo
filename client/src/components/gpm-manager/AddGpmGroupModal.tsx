import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { createGpmGroup } from '../../api/gpm';
import type { AddGpmGroupFormValues } from '../../types/gpm';
import { Button, Input, Modal } from '../ui';

interface AddGpmGroupModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const defaultValues: AddGpmGroupFormValues = {
  name: '',
};

export function AddGpmGroupModal({ open, onClose, onSuccess }: AddGpmGroupModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddGpmGroupFormValues>({
    defaultValues,
  });

  useEffect(() => {
    if (!open) return;
    reset(defaultValues);
    setApiError(null);
  }, [open, reset]);

  function handleClose() {
    reset(defaultValues);
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: AddGpmGroupFormValues) {
    setApiError(null);
    try {
      await createGpmGroup({
        name: values.name.trim(),
      });
      reset(defaultValues);
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to create group');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Create GPM Group"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={isSubmitting}
            form="add-gpm-group-form"
            type="submit"
          >
            {isSubmitting ? 'Creating…' : 'Create'}
          </Button>
        </>
      }
    >
      <form id="add-gpm-group-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="gpm-group-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Name
          </label>
          <Input
            id="gpm-group-name"
            placeholder="Group name"
            className="h-10 rounded-lg text-sm"
            disabled={isSubmitting}
            {...register('name', { required: 'Name is required' })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
