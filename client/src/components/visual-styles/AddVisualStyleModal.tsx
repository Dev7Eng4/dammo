import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { createVisualStyle } from '../../api/visualStyles';
import { Button, Input, Modal, Textarea } from '../ui';
import type { VisualStyleFormValues } from '../../types/visualStyle';

interface AddVisualStyleModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddVisualStyleModal({ open, onClose, onSuccess }: AddVisualStyleModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<VisualStyleFormValues>({
    defaultValues: {
      name: '',
      niche: '',
      rule: '',
    },
  });

  function handleClose() {
    reset();
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: VisualStyleFormValues) {
    setApiError(null);
    try {
      await createVisualStyle({
        name: values.name,
        niche: values.niche,
        rule: values.rule,
      });
      reset();
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to create visual style');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Visual Style"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button size="sm" className="rounded-lg" disabled={isSubmitting} form="add-visual-style-form" type="submit">
            {isSubmitting ? 'Saving...' : 'Add Style'}
          </Button>
        </>
      }
    >
      <form id="add-visual-style-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="style-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Name
          </label>
          <Input
            id="style-name"
            placeholder="Anime"
            className="h-10 rounded-lg"
            {...register('name', { required: 'Name is required' })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        <div>
          <label htmlFor="style-niche" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Niche
          </label>
          <Input
            id="style-niche"
            placeholder="horror, comedy, slice-of-life..."
            className="h-10 rounded-lg"
            {...register('niche', { required: 'Niche is required' })}
          />
          {errors.niche ? <p className="mt-1 text-xs text-danger">{errors.niche.message}</p> : null}
        </div>

        <div>
          <label htmlFor="style-rule" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Rule
          </label>
          <Textarea
            id="style-rule"
            rows={6}
            placeholder="Mô tả quy tắc visual style..."
            className="text-sm"
            {...register('rule', { required: 'Rule is required' })}
          />
          {errors.rule ? <p className="mt-1 text-xs text-danger">{errors.rule.message}</p> : null}
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
