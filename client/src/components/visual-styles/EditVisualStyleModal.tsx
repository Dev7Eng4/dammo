import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { updateVisualStyle } from '../../api/visualStyles';
import { Button, Input, Modal, Textarea } from '../ui';
import type { VisualStyle, VisualStyleFormValues } from '../../types/visualStyle';

interface EditVisualStyleModalProps {
  open: boolean;
  style: VisualStyle | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditVisualStyleModal({
  open,
  style,
  onClose,
  onSuccess,
}: EditVisualStyleModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<VisualStyleFormValues>();

  useEffect(() => {
    if (!style) return;
    reset({
      name: style.name,
      niche: style.niche,
      rule: style.rule,
    });
  }, [style, reset]);

  function handleClose() {
    reset();
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: VisualStyleFormValues) {
    if (!style) return;
    setApiError(null);
    try {
      await updateVisualStyle(style.id, {
        name: values.name,
        niche: values.niche,
        rule: values.rule,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to update visual style');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Edit Visual Style"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={isSubmitting || !style}
            form="edit-visual-style-form"
            type="submit"
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <form id="edit-visual-style-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="edit-style-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Name
          </label>
          <Input
            id="edit-style-name"
            className="h-10 rounded-lg"
            {...register('name', { required: 'Name is required' })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        <div>
          <label htmlFor="edit-style-niche" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Niche
          </label>
          <Input
            id="edit-style-niche"
            className="h-10 rounded-lg"
            {...register('niche', { required: 'Niche is required' })}
          />
          {errors.niche ? <p className="mt-1 text-xs text-danger">{errors.niche.message}</p> : null}
        </div>

        <div>
          <label htmlFor="edit-style-rule" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Rule
          </label>
          <Textarea id="edit-style-rule" rows={6} className="text-sm" {...register('rule', { required: 'Rule is required' })} />
          {errors.rule ? <p className="mt-1 text-xs text-danger">{errors.rule.message}</p> : null}
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
