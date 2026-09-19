import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createVisualStyle } from '../../api/visualStyles';
import { Button, Input, Modal, Textarea } from '../ui';
import type { VisualStyleFormValues } from '../../types/visualStyle';

interface AddVisualStyleModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddVisualStyleModal({ open, onClose, onSuccess }: AddVisualStyleModalProps) {
  const { t } = useTranslation(['content', 'common']);
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
      setApiError(err instanceof Error ? err.message : t('visual.createError'));
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('visual.addTitle')}
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button size="sm" className="rounded-lg" disabled={isSubmitting} form="add-visual-style-form" type="submit">
            {isSubmitting ? t('common:actions.saving') : t('visual.addSubmit')}
          </Button>
        </>
      }
    >
      <form id="add-visual-style-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="style-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('visual.form.name')}
          </label>
          <Input
            id="style-name"
            placeholder="Anime"
            className="h-10 rounded-lg"
            {...register('name', { required: t('visual.form.nameRequired') })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        <div>
          <label htmlFor="style-niche" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('visual.form.niche')}
          </label>
          <Input
            id="style-niche"
            placeholder="horror, comedy, slice-of-life..."
            className="h-10 rounded-lg"
            {...register('niche', { required: t('visual.form.nicheRequired') })}
          />
          {errors.niche ? <p className="mt-1 text-xs text-danger">{errors.niche.message}</p> : null}
        </div>

        <div>
          <label htmlFor="style-rule" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('visual.form.rule')}
          </label>
          <Textarea
            id="style-rule"
            rows={6}
            placeholder={t('visual.form.rulePlaceholder')}
            className="text-sm"
            {...register('rule', { required: t('visual.form.ruleRequired') })}
          />
          {errors.rule ? <p className="mt-1 text-xs text-danger">{errors.rule.message}</p> : null}
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
