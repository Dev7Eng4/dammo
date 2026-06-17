import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import {
  VIDEO_DESTINATION_OPTIONS,
  VIDEO_TEMPLATE_OPTIONS,
} from '../../constants/videoFactory';
import type { VideoFactoryFormValues } from '../../types/videoProduction';
import { Button, Input, Select } from '../ui';

interface VideoFactoryFormProps {
  onQueued?: () => void;
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
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-neutral-300">
        {label}
        {optional ? <span className="ml-1 text-neutral-500">(optional)</span> : null}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function VideoFactoryForm({ onQueued }: VideoFactoryFormProps) {
  const navigate = useNavigate();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<VideoFactoryFormValues>({ defaultValues });

  function onSubmit(_values: VideoFactoryFormValues) {
    onQueued?.();
    reset(defaultValues);
    navigate('/render-queue');
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <FormField label="Project Name" htmlFor="projectName" error={errors.projectName?.message}>
          <Input
            id="projectName"
            placeholder="Top 10 AI Tools"
            {...register('projectName', { required: 'Project name is required' })}
          />
        </FormField>

        <FormField label="Template" error={errors.template?.message}>
          <Controller
            name="template"
            control={control}
            rules={{ required: 'Template is required' }}
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
                placeholder="Select template"
              />
            )}
          />
        </FormField>

        <FormField label="Destination" error={errors.destination?.message}>
          <Controller
            name="destination"
            control={control}
            rules={{ required: 'Destination is required' }}
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
                placeholder="Select destination"
              />
            )}
          />
        </FormField>

        <FormField label="Dataset Path" htmlFor="datasetPath" error={errors.datasetPath?.message}>
          <Input
            id="datasetPath"
            placeholder="./data/job_dataset.json"
            className="font-mono text-sm"
            {...register('datasetPath', { required: 'Dataset path is required' })}
          />
        </FormField>

        <FormField label="Assets Path" htmlFor="assetsPath" error={errors.assetsPath?.message}>
          <Input
            id="assetsPath"
            placeholder="./assets/project_001/"
            className="font-mono text-sm"
            {...register('assetsPath', { required: 'Assets path is required' })}
          />
        </FormField>

        <FormField label="Voiceover Path" htmlFor="voiceoverPath" optional>
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
          Queue Render
        </Button>
        <Button
          type="button"
          variant="outlined"
          size="sm"
          className="rounded-lg"
          onClick={() => reset(defaultValues)}
        >
          Reset
        </Button>
      </div>
    </form>
  );
}
