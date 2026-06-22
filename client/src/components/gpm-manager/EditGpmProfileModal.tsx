import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { updateGpmProfile } from '../../api/gpm';
import type { EditGpmProfileFormValues, GpmGroup, GpmProfile } from '../../types/gpm';
import { Button, Input, Modal, Select, Textarea } from '../ui';

interface EditGpmProfileModalProps {
  open: boolean;
  profile: GpmProfile | null;
  groups: GpmGroup[];
  onClose: () => void;
  onSuccess: () => void;
}

export function EditGpmProfileModal({ open, profile, groups, onClose, onSuccess }: EditGpmProfileModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);

  const groupOptions = useMemo(
    () => [
      { value: '', label: 'No group' },
      ...groups.map((group) => ({ value: group.id, label: group.name })),
    ],
    [groups],
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EditGpmProfileFormValues>();

  const groupId = watch('group_id');

  useEffect(() => {
    if (!open || !profile) return;
    reset({
      name: profile.name,
      group_id: profile.group_id ?? '',
      raw_proxy: profile.raw_proxy ?? '',
      note: profile.note ?? '',
    });
    setApiError(null);
  }, [open, profile, reset]);

  function handleClose() {
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: EditGpmProfileFormValues) {
    if (!profile) return;
    setApiError(null);
    try {
      await updateGpmProfile(profile.id, {
        name: values.name.trim(),
        group_id: values.group_id || null,
        raw_proxy: values.raw_proxy.trim() || undefined,
        note: values.note.trim() || null,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to update profile');
    }
  }

  if (!profile) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Edit GPM Profile"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={isSubmitting}
            form="edit-gpm-profile-form"
            type="submit"
          >
            {isSubmitting ? 'Saving…' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <form id="edit-gpm-profile-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="edit-gpm-profile-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Name
          </label>
          <Input
            id="edit-gpm-profile-name"
            className="h-10 rounded-lg text-sm"
            disabled={isSubmitting}
            {...register('name', { required: 'Name is required' })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        <div>
          <label htmlFor="edit-gpm-profile-group" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Group
          </label>
          <Select
            id="edit-gpm-profile-group"
            value={groupId ?? ''}
            onChange={(value) => setValue('group_id', value)}
            options={groupOptions}
            disabled={isSubmitting}
            triggerClassName="h-10 rounded-lg text-sm"
          />
        </div>

        <div>
          <label htmlFor="edit-gpm-profile-proxy" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Proxy
          </label>
          <Input
            id="edit-gpm-profile-proxy"
            className="h-10 rounded-lg font-mono text-sm"
            disabled={isSubmitting}
            {...register('raw_proxy')}
          />
        </div>

        <div>
          <label htmlFor="edit-gpm-profile-note" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Note
          </label>
          <Textarea
            id="edit-gpm-profile-note"
            rows={3}
            disabled={isSubmitting}
            {...register('note')}
          />
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
