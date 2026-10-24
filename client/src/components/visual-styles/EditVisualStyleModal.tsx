import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { updateVisualStyle } from '../../api/visualStyles';
import { PROMPT_FORM_LANGUAGE_OPTIONS } from '../../constants/promptForm';
import { Button, DropdownSelect, Input, Modal, Textarea } from '../ui';
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
  const { t } = useTranslation(['content', 'common']);
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<VisualStyleFormValues>();

  useEffect(() => {
    if (!style) return;
    reset({
      name: style.name,
      niche: style.niche,
      language: style.language ?? 'all',
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
        language: values.language,
        rule: values.rule,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : t('visual.updateError'));
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('visual.editTitle')}
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={isSubmitting || !style}
            form="edit-visual-style-form"
            type="submit"
          >
            {isSubmitting ? t('common:actions.saving') : t('visual.saveChanges')}
          </Button>
        </>
      }
    >
      <form id="edit-visual-style-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="edit-style-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('visual.form.name')}
          </label>
          <Input
            id="edit-style-name"
            className="h-10 rounded-lg"
            {...register('name', { required: t('visual.form.nameRequired') })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        <div>
          <label htmlFor="edit-style-niche" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('visual.form.niche')}
          </label>
          <Input
            id="edit-style-niche"
            className="h-10 rounded-lg"
            {...register('niche', { required: t('visual.form.nicheRequired') })}
          />
          {errors.niche ? <p className="mt-1 text-xs text-danger">{errors.niche.message}</p> : null}
        </div>

        <div>
          <label htmlFor="edit-style-language" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('visual.form.language')}
          </label>
          <Controller
            control={control}
            name="language"
            render={({ field }) => (
              <DropdownSelect
                id="edit-style-language"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                options={PROMPT_FORM_LANGUAGE_OPTIONS}
                className="w-full"
                triggerClassName="h-10 w-full rounded-lg"
              />
            )}
          />
        </div>

        <div>
          <label htmlFor="edit-style-rule" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('visual.form.rule')}
          </label>
          <Textarea
            id="edit-style-rule"
            rows={6}
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
