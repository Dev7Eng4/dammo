import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { enqueueRenderJob } from '../../api/renderQueue';
import {
  VIDEO_DESTINATION_OPTIONS,
  VIDEO_TEMPLATE_OPTIONS,
} from '../../constants/videoFactory';
import type { VideoFactoryFormValues } from '../../types/videoProduction';
import { Button, Input, Select } from '../ui';
import { useTranslation } from 'react-i18next';

interface VideoFactoryFormProps {
  onQueued?: () => void;
  onError?: (message: string) => void;
}

const defaultValues: VideoFactoryFormValues = {
  projectName: '',
  template: '',
  destination: '',
  datasetPath: '',
  assetsPath: '',
  voiceoverPath: '',
};

function FormField({
  label,
  htmlFor,
  optional,
  children,
  error,
}: {
  label: string;
  htmlFor?: string;
  optional?: boolean;
  children: React.ReactNode;
  error?: string;
}) {
  const { t } = useTranslation('common');

  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-neutral-300">
        {label}
        {optional ? <span className="ml-1 text-neutral-500">{t('actions.optional')}</span> : null}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function VideoFactoryForm({ onQueued, onError }: VideoFactoryFormProps) {
  const { t } = useTranslation(['factory', 'common']);
  const navigate = useNavigate();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<VideoFactoryFormValues>({ defaultValues });

  async function onSubmit(values: VideoFactoryFormValues) {
    try {
      await enqueueRenderJob({
        fileName: values.projectName.trim(),
        inputPath: values.datasetPath.trim(),
        preset: values.template.trim() || undefined,
      });
      onQueued?.();
      reset(defaultValues);
      navigate('/manual-video');
    } catch (err) {
      onError?.(err instanceof Error ? err.message : t('videoFactory.form.queueError'));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <FormField label={t('videoFactory.form.projectName')} htmlFor="projectName" error={errors.projectName?.message}>
          <Input
            id="projectName"
            placeholder={t('videoFactory.form.projectNamePlaceholder')}
            {...register('projectName', { required: t('videoFactory.form.projectNameRequired') })}
          />
        </FormField>

        <FormField label={t('videoFactory.form.template')} error={errors.template?.message}>
          <Controller
            name="template"
            control={control}
            rules={{ required: t('videoFactory.form.templateRequired') }}
            render={({ field }) => (
              <Select
                id="template"
                options={VIDEO_TEMPLATE_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={t('videoFactory.form.templatePlaceholder')}
              />
            )}
          />
        </FormField>

        <FormField label={t('videoFactory.form.destination')} error={errors.destination?.message}>
          <Controller
            name="destination"
            control={control}
            rules={{ required: t('videoFactory.form.destinationRequired') }}
            render={({ field }) => (
              <Select
                id="destination"
                options={VIDEO_DESTINATION_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={t('videoFactory.form.destinationPlaceholder')}
              />
            )}
          />
        </FormField>

        <FormField label={t('videoFactory.form.datasetPath')} htmlFor="datasetPath" error={errors.datasetPath?.message}>
          <Input
            id="datasetPath"
            placeholder="./data/job_dataset.json"
            className="font-mono text-sm"
            {...register('datasetPath', { required: t('videoFactory.form.datasetPathRequired') })}
          />
        </FormField>

        <FormField label={t('videoFactory.form.assetsPath')} htmlFor="assetsPath" error={errors.assetsPath?.message}>
          <Input
            id="assetsPath"
            placeholder="./assets/project_001/"
            className="font-mono text-sm"
            {...register('assetsPath', { required: t('videoFactory.form.assetsPathRequired') })}
          />
        </FormField>

        <FormField label={t('videoFactory.form.voiceoverPath')} htmlFor="voiceoverPath" optional>
          <Input
            id="voiceoverPath"
            placeholder="./audio/voiceover.mp3"
            className="font-mono text-sm"
            {...register('voiceoverPath')}
          />
        </FormField>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
        <Button type="submit" size="sm" className="rounded-lg" disabled={isSubmitting}>
          {t('videoFactory.form.queue')}
        </Button>
        <Button
          type="button"
          variant="outlined"
          size="sm"
          className="rounded-lg"
          onClick={() => reset(defaultValues)}
        >
          {t('common:actions.reset')}
        </Button>
      </div>
    </form>
  );
}
