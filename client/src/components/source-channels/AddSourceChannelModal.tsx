import { Controller, useForm } from 'react-hook-form';
import { SOURCE_PURPOSE_OPTIONS } from './PurposePill';
import { Button, Modal, Select } from '../ui';
import type { AddSourceChannelFormValues, CreateSourceChannelPayload } from '../../types/sourceChannel';

interface AddSourceChannelModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (payloads: CreateSourceChannelPayload[]) => void;
}

const defaultValues: AddSourceChannelFormValues = {
  url: '',
  purpose: '',
};

export function AddSourceChannelModal({ open, onClose, onAdd }: AddSourceChannelModalProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<AddSourceChannelFormValues>({
    defaultValues,
  });

  function handleClose() {
    reset(defaultValues);
    onClose();
  }

  function onSubmit(values: AddSourceChannelFormValues) {
    if (!values.purpose) return;

    const urls = values.url
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urls.length === 0) return;

    const payloads: CreateSourceChannelPayload[] = urls.map((url) => ({
      url,
      purpose: values.purpose as CreateSourceChannelPayload['purpose'],
    }));

    reset(defaultValues);
    onAdd(payloads);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Source Channel"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose}>
            Cancel
          </Button>
          <Button size="sm" className="rounded-lg" form="add-source-form" type="submit">
            Add Source
          </Button>
        </>
      }
    >
      <form id="add-source-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="source-url" className="mb-1.5 block text-xs font-medium text-neutral-400">
            URL / Handle
            <span className="ml-1 font-normal text-neutral-500">(mỗi dòng một link)</span>
          </label>
          <textarea
            id="source-url"
            rows={5}
            placeholder={`https://youtube.com/@channel1\nhttps://youtube.com/@channel2\n@handle`}
            className="w-full resize-y rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-100 placeholder-neutral-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            {...register('url', { required: 'Nhập ít nhất một URL' })}
          />
          {errors.url ? <p className="mt-1 text-xs text-danger">{errors.url.message}</p> : null}
        </div>

        <div>
          <label htmlFor="source-purpose" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Purpose
          </label>
          <Controller
            name="purpose"
            control={control}
            rules={{ required: 'Purpose is required' }}
            render={({ field }) => (
              <Select
                id="source-purpose"
                options={SOURCE_PURPOSE_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder="Select purpose"
                className="w-full"
                triggerClassName="h-10 w-full min-w-0 rounded-lg px-3 py-0"
              />
            )}
          />
          {errors.purpose ? <p className="mt-1 text-xs text-danger">{errors.purpose.message}</p> : null}
        </div>

        <p className="text-xs text-neutral-500">
          Platform is detected automatically. YouTube channels fetch metadata and videos in the background after add.
        </p>
      </form>
    </Modal>
  );
}
