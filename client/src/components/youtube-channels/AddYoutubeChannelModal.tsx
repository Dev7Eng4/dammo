import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { fetchMailAccounts } from '../../api/mailAccounts';
import { fetchSourceChannels } from '../../api/sourceChannels';
import { createYoutubeChannel } from '../../api/youtubeChannels';
import { Button, Input, Modal, Select } from '../ui';
import type { AddYoutubeChannelFormValues } from '../../types/youtubeChannel';

interface AddYoutubeChannelModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddYoutubeChannelModal({ open, onClose, onSuccess }: AddYoutubeChannelModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [mailOptions, setMailOptions] = useState<{ value: string; label: string }[]>([]);
  const [sourceOptions, setSourceOptions] = useState<{ value: string; label: string }[]>([]);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddYoutubeChannelFormValues>({
    defaultValues: {
      mailAccountId: '',
      channelUrl: '',
      sourceChannelId: '',
    },
  });

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setOptionsLoading(true);

    Promise.all([
      fetchMailAccounts('all', '', 1, 100),
      fetchSourceChannels('all', 'all', 'all', '', 1, 100),
    ])
      .then(([mails, sources]) => {
        if (cancelled) return;
        setMailOptions(
          mails.items.map((account) => ({
            value: account.id,
            label: account.email,
          })),
        );
        setSourceOptions(
          sources.items.map((source) => ({
            value: source.id,
            label: `${source.name} (${source.url})`,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setMailOptions([]);
          setSourceOptions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setOptionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  function handleClose() {
    reset();
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: AddYoutubeChannelFormValues) {
    setApiError(null);
    try {
      await createYoutubeChannel({
        mailAccountId: values.mailAccountId,
        channelUrl: values.channelUrl.trim(),
        sourceChannelId: values.sourceChannelId,
      });
      reset();
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to create channel');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add YouTube Channel"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={isSubmitting || optionsLoading}
            form="add-youtube-channel-form"
            type="submit"
          >
            {isSubmitting ? 'Fetching channel info...' : 'Add Channel'}
          </Button>
        </>
      }
    >
      <form id="add-youtube-channel-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="mail-account" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Linked Email
          </label>
          <Controller
            name="mailAccountId"
            control={control}
            rules={{ required: 'Email is required' }}
            render={({ field }) => (
              <Select
                id="mail-account"
                options={mailOptions}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={optionsLoading ? 'Loading emails...' : 'Select email account'}
                searchPlaceholder="Search email..."
                searchable
                disabled={isSubmitting || optionsLoading}
              />
            )}
          />
          {errors.mailAccountId ? (
            <p className="mt-1 text-xs text-danger">{errors.mailAccountId.message}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="channel-url" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Channel URL
          </label>
          <Input
            id="channel-url"
            placeholder="https://youtube.com/@channel or @handle"
            className="h-10 rounded-lg font-mono text-sm"
            disabled={isSubmitting}
            {...register('channelUrl', { required: 'Channel URL is required' })}
          />
          {errors.channelUrl ? (
            <p className="mt-1 text-xs text-danger">{errors.channelUrl.message}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="source-channel" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Source Channel
          </label>
          <Controller
            name="sourceChannelId"
            control={control}
            rules={{ required: 'Source is required' }}
            render={({ field }) => (
              <Select
                id="source-channel"
                options={sourceOptions}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={optionsLoading ? 'Loading sources...' : 'Select source channel'}
                disabled={isSubmitting || optionsLoading}
              />
            )}
          />
          {errors.sourceChannelId ? (
            <p className="mt-1 text-xs text-danger">{errors.sourceChannelId.message}</p>
          ) : null}
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
