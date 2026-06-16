import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { createSourceChannel } from '../../api/sourceChannels';
import { Button, Input, Modal } from '../ui';
import type { AddSourceChannelFormValues } from '../../types/sourceChannel';

interface AddSourceChannelModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddSourceChannelModal({ open, onClose, onSuccess }: AddSourceChannelModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddSourceChannelFormValues>({
    defaultValues: { url: '' },
  });

  function handleClose() {
    reset();
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: AddSourceChannelFormValues) {
    setApiError(null);
    try {
      await createSourceChannel({ url: values.url.trim() });
      reset();
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to create source channel');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Source Channel"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button size="sm" className="rounded-lg" disabled={isSubmitting} form="add-source-form" type="submit">
            {isSubmitting ? 'Fetching channel info and videos...' : 'Add Source'}
          </Button>
        </>
      }
    >
      <form id="add-source-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="source-url" className="mb-1.5 block text-xs font-medium text-neutral-400">
            URL / Handle
          </label>
          <Input
            id="source-url"
            placeholder="https://youtube.com/@channel or @handle"
            className="h-10 rounded-lg font-mono text-sm"
            disabled={isSubmitting}
            {...register('url', { required: 'URL is required' })}
          />
          {errors.url ? <p className="mt-1 text-xs text-danger">{errors.url.message}</p> : null}
          <p className="mt-1.5 text-xs text-neutral-500">
            Platform is detected automatically. YouTube channels fetch metadata and all videos on add.
          </p>
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
