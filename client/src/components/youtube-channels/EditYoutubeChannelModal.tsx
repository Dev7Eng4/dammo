import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { fetchMailAccounts } from '../../api/mailAccounts';
import { fetchThumbnailStyles } from '../../api/prompts';
import { fetchSourceChannels } from '../../api/sourceChannels';
import { updateYoutubeChannel } from '../../api/youtubeChannels';
import {
  createEmptyPublishTimes,
  getChannelUploadTimes,
  getPublishTimeSlotCount,
  UPLOAD_FREQUENCY_OPTIONS,
  YOUTUBE_CHANNEL_LANGUAGE_OPTIONS,
  YOUTUBE_CHANNEL_TYPE_OPTIONS,
} from '../../constants/youtubeChannelForm';
import { useAbortableEffect } from '../../hooks';
import type { SourceChannel } from '../../types/sourceChannel';
import type { EditYoutubeChannelFormValues, StoredYoutubeChannelType, YoutubeChannel, YoutubeChannelLanguage } from '../../types/youtubeChannel';
import { isReupYoutubeChannelType, parseStoredChannelLanguage } from '../../types/youtubeChannel';
import { Button, Input, Modal, MultiSelect, Select } from '../ui';

interface EditYoutubeChannelModalProps {
  open: boolean;
  channel: YoutubeChannel;
  onClose: () => void;
  onSuccess: (channel: YoutubeChannel) => void;
}

function toSourceOption(source: SourceChannel) {
  return {
    value: source.id,
    label: `${source.name} (${source.url})`,
  };
}

function normalizeChannelType(type: StoredYoutubeChannelType): EditYoutubeChannelFormValues['type'] {
  return type === 'reup' ? 'reup_video' : type;
}

const defaultValues: EditYoutubeChannelFormValues = {
  mailAccountId: '',
  type: '',
  language: '',
  sourceChannels: [],
  backgroundFootageSources: [],
  thumbnailStyleKey: '',
  uploadFrequency: '',
  publishTimes: [],
};

function FormField({
  label,
  htmlFor,
  optional,
  children,
  error,
  className,
}: {
  label: string;
  htmlFor?: string;
  optional?: boolean;
  children: React.ReactNode;
  error?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-neutral-400">
        {label}
        {optional ? <span className="text-neutral-500"> (optional)</span> : null}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function EditYoutubeChannelModal({
  open,
  channel,
  onClose,
  onSuccess,
}: EditYoutubeChannelModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [mailAccountId, setMailAccountId] = useState('');
  const [sources, setSources] = useState<SourceChannel[]>([]);
  const [formReady, setFormReady] = useState(false);
  const [thumbnailStyleOptions, setThumbnailStyleOptions] = useState<{ value: string; label: string }[]>([]);
  const [thumbnailStylesLoading, setThumbnailStylesLoading] = useState(false);

  const {
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    getValues,
    register,
    formState: { errors, isSubmitting },
  } = useForm<EditYoutubeChannelFormValues>({ defaultValues });

  const channelType = watch('type');
  const isReupType = isReupYoutubeChannelType(channelType);
  const language = watch('language') as YoutubeChannelLanguage | '';
  const uploadFrequency = watch('uploadFrequency');
  const publishTimeSlotCount = getPublishTimeSlotCount(uploadFrequency);

  const sourceOptions = useMemo(
    () => sources.filter((s) => s.purpose !== 'background_footage').map(toSourceOption),
    [sources],
  );
  const backgroundFootageOptions = useMemo(
    () => sources.filter((s) => s.purpose === 'background_footage').map(toSourceOption),
    [sources],
  );

  useAbortableEffect(
    async (signal) => {
      if (!open) {
        setFormReady(false);
        setMailAccountId('');
        return;
      }

      setOptionsLoading(true);
      setFormReady(false);

      try {
        const [mails, sourceList] = await Promise.all([
          fetchMailAccounts('all', '', 1, 100, { signal }),
          fetchSourceChannels('all', 'all', 'all', '', 1, 100, { signal }),
        ]);

        const mailAccount = mails.items.find(
          (account) => account.email.toLowerCase() === channel.linkedEmail.toLowerCase(),
        );

        const isDefaultMail = channel.linkedEmail.toLowerCase() === 'default';
        const mailAccountIdValue = mailAccount?.id ?? (isDefaultMail ? 'default' : '');

        setMailAccountId(mailAccountIdValue);
        setSources(sourceList.items);

        const frequency = channel.uploadFrequency ?? '';
        const slotCount = getPublishTimeSlotCount(frequency);
        const savedTimes = getChannelUploadTimes(channel);
        const publishTimes =
          savedTimes.length === slotCount ? savedTimes : createEmptyPublishTimes(slotCount);

        reset({
          mailAccountId: mailAccountIdValue,
          type: normalizeChannelType(channel.type),
          language: parseStoredChannelLanguage(channel.language),
          sourceChannels: channel.sourceChannels ?? [],
          backgroundFootageSources: channel.backgroundFootageSources ?? [],
          thumbnailStyleKey: channel.thumbnailStyleKey ?? '',
          uploadFrequency: frequency,
          publishTimes,
        });
        setFormReady(true);
      } catch {
        if (signal.aborted) return;
        setMailAccountId('');
        setSources([]);
      } finally {
        if (!signal.aborted) setOptionsLoading(false);
      }
    },
    [open, channel],
    { enabled: open },
  );

  useEffect(() => {
    if (!formReady) return;
    const current = getValues('publishTimes');
    if (current.length !== publishTimeSlotCount) {
      setValue('publishTimes', createEmptyPublishTimes(publishTimeSlotCount));
    }
  }, [publishTimeSlotCount, formReady, setValue, getValues]);

  useAbortableEffect(
    async (signal) => {
      if (!open || !language) {
        setThumbnailStyleOptions([]);
        return;
      }

      setThumbnailStylesLoading(true);
      try {
        const { items } = await fetchThumbnailStyles(language, { signal });
        const options = items.map((item) => ({ value: item.key, label: item.name }));
        setThumbnailStyleOptions(options);

        const current = getValues('thumbnailStyleKey');
        if (current && !options.some((option) => option.value === current)) {
          setValue('thumbnailStyleKey', '');
        }
      } catch {
        if (signal.aborted) return;
        setThumbnailStyleOptions([]);
      } finally {
        if (!signal.aborted) setThumbnailStylesLoading(false);
      }
    },
    [language, open, formReady],
    { enabled: open && formReady && Boolean(language) },
  );

  function handleClose() {
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: EditYoutubeChannelFormValues) {
    if (!values.type || !values.uploadFrequency || !values.language || !mailAccountId) return;

    setApiError(null);
    try {
      const { item } = await updateYoutubeChannel(channel.id, {
        mailAccountId,
        type: values.type,
        language: values.language,
        uploadFrequency: values.uploadFrequency,
        publishTimes: values.publishTimes,
        ...(values.sourceChannels.length > 0 ? { sourceChannels: values.sourceChannels } : {}),
        ...(values.backgroundFootageSources.length > 0
          ? { backgroundFootageSources: values.backgroundFootageSources }
          : {}),
        ...(values.thumbnailStyleKey ? { thumbnailStyleKey: values.thumbnailStyleKey } : {}),
      });
      onSuccess(item);
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to update channel');
    }
  }

  const selectTriggerClass = 'h-10 w-full min-w-0 rounded-lg px-3 py-0';

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Edit YouTube Channel"
      className="max-h-[90vh] max-w-3xl flex flex-col"
      bodyClassName="max-h-[60vh] overflow-y-auto"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={isSubmitting || optionsLoading || !formReady || !mailAccountId}
            form="edit-youtube-channel-form"
            type="submit"
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <form
        id="edit-youtube-channel-form"
        onSubmit={handleSubmit(onSubmit)}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <FormField label="Linked Email" className="min-w-0">
          <div className="flex h-10 items-center rounded-lg border border-neutral-800 bg-surface-elevated px-3 text-sm text-neutral-300">
            <span className="truncate">{channel.linkedEmail}</span>
          </div>
        </FormField>

        <FormField label="Channel" className="min-w-0">
          <div className="flex h-10 items-center rounded-lg border border-neutral-800 bg-surface-elevated px-3 text-sm text-neutral-300">
            <span className="truncate">{channel.name}</span>
          </div>
        </FormField>

        <FormField label="Channel Type" htmlFor="edit-channel-type" error={errors.type?.message} className="min-w-0">
          <Controller
            name="type"
            control={control}
            rules={{ required: 'Channel type is required' }}
            render={({ field }) => (
              <Select
                id="edit-channel-type"
                options={YOUTUBE_CHANNEL_TYPE_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder="Select channel type"
                disabled={isSubmitting}
                className="w-full"
                triggerClassName={selectTriggerClass}
              />
            )}
          />
        </FormField>

        <FormField
          label="Language"
          htmlFor="edit-channel-language"
          error={errors.language?.message}
          className="min-w-0"
        >
          <Controller
            name="language"
            control={control}
            rules={{ required: 'Language is required' }}
            render={({ field }) => (
              <Select
                id="edit-channel-language"
                options={YOUTUBE_CHANNEL_LANGUAGE_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder="Select language"
                disabled={isSubmitting}
                className="w-full"
                triggerClassName={selectTriggerClass}
              />
            )}
          />
        </FormField>

        <FormField
          label="Thumbnail Style"
          htmlFor="edit-thumbnail-style"
          optional
          error={errors.thumbnailStyleKey?.message}
          className="min-w-0"
        >
          <Controller
            name="thumbnailStyleKey"
            control={control}
            render={({ field }) => (
              <Select
                id="edit-thumbnail-style"
                options={thumbnailStyleOptions}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={
                  !language
                    ? 'Select language first'
                    : thumbnailStylesLoading
                      ? 'Loading styles...'
                      : thumbnailStyleOptions.length === 0
                        ? 'No thumbnail styles for this language'
                        : 'Select thumbnail style'
                }
                disabled={isSubmitting || !language || thumbnailStylesLoading}
                className="w-full"
                triggerClassName={selectTriggerClass}
              />
            )}
          />
        </FormField>

        <FormField label="Background Footage" htmlFor="edit-background-footage" optional className="min-w-0">
          <Controller
            name="backgroundFootageSources"
            control={control}
            render={({ field }) => (
              <MultiSelect
                id="edit-background-footage"
                options={backgroundFootageOptions}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={optionsLoading ? 'Loading sources...' : 'Select background footage'}
                searchPlaceholder="Search background footage..."
                searchable
                disabled={isSubmitting || optionsLoading}
                className="w-full"
                triggerClassName="min-h-10 w-full min-w-0 rounded-lg px-2 py-1.5"
              />
            )}
          />
        </FormField>

        <FormField
          label="Source Channels"
          htmlFor="edit-source-channel"
          optional={!isReupType}
          error={errors.sourceChannels?.message}
          className="min-w-0 sm:col-span-2"
        >
          <Controller
            name="sourceChannels"
            control={control}
            rules={{
              validate: (value) =>
                !isReupType || value.length > 0 || 'Source channels are required',
            }}
            render={({ field }) => (
              <MultiSelect
                id="edit-source-channel"
                options={sourceOptions}
                value={field.value ?? []}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={optionsLoading ? 'Loading sources...' : 'Select source channels'}
                searchPlaceholder="Search source channels..."
                searchable
                disabled={isSubmitting || optionsLoading}
                className="w-full"
                triggerClassName="min-h-10 w-full min-w-0 rounded-lg px-2 py-1.5"
              />
            )}
          />
        </FormField>

        <FormField
          label="Upload Frequency"
          htmlFor="edit-upload-frequency"
          error={errors.uploadFrequency?.message}
          className="min-w-0"
        >
          <Controller
            name="uploadFrequency"
            control={control}
            rules={{ required: 'Upload frequency is required' }}
            render={({ field }) => (
              <Select
                id="edit-upload-frequency"
                options={UPLOAD_FREQUENCY_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder="Select upload frequency"
                disabled={isSubmitting}
                className="w-full"
                triggerClassName={selectTriggerClass}
              />
            )}
          />
        </FormField>

        {publishTimeSlotCount > 0
          ? Array.from({ length: publishTimeSlotCount }).map((_, index) => (
              <FormField
                key={index}
                label={publishTimeSlotCount === 1 ? 'Publish Time' : `Publish Time ${index + 1}`}
                htmlFor={`edit-publish-time-${index}`}
                error={errors.publishTimes?.[index]?.message}
                className="min-w-0"
              >
                <Input
                  id={`edit-publish-time-${index}`}
                  type="time"
                  className="h-10 rounded-lg text-sm"
                  disabled={isSubmitting}
                  {...register(`publishTimes.${index}` as const, {
                    required: 'Publish time is required',
                  })}
                />
              </FormField>
            ))
          : null}

        {apiError ? <p className="text-xs text-danger sm:col-span-2">{apiError}</p> : null}
        {!optionsLoading && formReady && !mailAccountId ? (
          <p className="text-xs text-danger sm:col-span-2">
            Linked mail account not found. Cannot save changes.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
