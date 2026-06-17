import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { fetchMailAccounts } from '../../api/mailAccounts';
import { fetchSourceChannels } from '../../api/sourceChannels';
import { fetchYoutubeChannels, updateYoutubeChannel } from '../../api/youtubeChannels';
import {
  createEmptyPublishTimes,
  getPublishTimeSlotCount,
  UPLOAD_FREQUENCY_OPTIONS,
  YOUTUBE_CHANNEL_TYPE_OPTIONS,
} from '../../constants/youtubeChannelForm';
import { useAbortableEffect } from '../../hooks';
import type { SourceChannel } from '../../types/sourceChannel';
import type { EditYoutubeChannelFormValues, YoutubeChannel } from '../../types/youtubeChannel';
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

function parseSourceChannelIds(sourceMapping: string, sources: SourceChannel[]): string[] {
  if (!sourceMapping.trim()) return [];

  const urls = sourceMapping.split(',').map((part) => part.trim().toLowerCase());
  return sources
    .filter((source) => urls.includes(source.fullUrl.toLowerCase()))
    .map((source) => source.id);
}

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
  const [mailOptions, setMailOptions] = useState<{ value: string; label: string }[]>([]);
  const [sources, setSources] = useState<SourceChannel[]>([]);
  const [formReady, setFormReady] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EditYoutubeChannelFormValues>();

  const channelType = watch('type');
  const uploadFrequency = watch('uploadFrequency');
  const publishTimeSlotCount = getPublishTimeSlotCount(uploadFrequency);

  const sourceOptions = useMemo(() => sources.map(toSourceOption), [sources]);
  const reupSourceOptions = useMemo(
    () => sources.filter((s) => s.purpose === 'reup').map(toSourceOption),
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
        return;
      }

      setOptionsLoading(true);
      setFormReady(false);

      try {
        const [mails, sourceList, channels] = await Promise.all([
          fetchMailAccounts('all', '', 1, 100, { signal }),
          fetchSourceChannels('all', 'all', 'all', '', 1, 100, { signal }),
          fetchYoutubeChannels('all', 'all', '', 1, 100, { signal }),
        ]);

        const usedEmails = new Set(
          channels.items
            .filter((item) => item.id !== channel.id)
            .map((item) => item.linkedEmail.toLowerCase()),
        );

        const mailAccount = mails.items.find(
          (account) => account.email.toLowerCase() === channel.linkedEmail.toLowerCase(),
        );

        setMailOptions(
          mails.items
            .filter(
              (account) =>
                account.id === mailAccount?.id ||
                !usedEmails.has(account.email.toLowerCase()),
            )
            .map((account) => ({
              value: account.id,
              label: account.email,
            })),
        );
        setSources(sourceList.items);

        const frequency = channel.uploadFrequency ?? '';
        const slotCount = getPublishTimeSlotCount(frequency);
        const publishTimes =
          channel.publishTimes && channel.publishTimes.length === slotCount
            ? channel.publishTimes
            : createEmptyPublishTimes(slotCount);

        reset({
          mailAccountId: mailAccount?.id ?? '',
          type: channel.type,
          sourceChannelIds: parseSourceChannelIds(channel.sourceMapping, sourceList.items),
          reupVideoSourceId: channel.reupVideoSourceId ?? '',
          reupAudioSourceId: channel.reupAudioSourceId ?? '',
          backgroundFootageSourceId: channel.backgroundFootageSourceId ?? '',
          uploadFrequency: frequency,
          publishTimes,
        });
        setFormReady(true);
      } catch {
        if (signal.aborted) return;
        setMailOptions([]);
        setSources([]);
      } finally {
        if (!signal.aborted) setOptionsLoading(false);
      }
    },
    [open, channel],
    { enabled: open },
  );

  useEffect(() => {
    if (!formReady || channelType === 'reup') return;
    setValue('reupVideoSourceId', '');
    setValue('reupAudioSourceId', '');
  }, [channelType, formReady, setValue]);

  useEffect(() => {
    if (!formReady) return;
    setValue('publishTimes', (current) => {
      if (current.length === publishTimeSlotCount) return current;
      return createEmptyPublishTimes(publishTimeSlotCount);
    });
  }, [publishTimeSlotCount, formReady, setValue]);

  function handleClose() {
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: EditYoutubeChannelFormValues) {
    if (!values.type || !values.uploadFrequency) return;

    setApiError(null);
    try {
      const { item } = await updateYoutubeChannel(channel.id, {
        mailAccountId: values.mailAccountId,
        type: values.type,
        uploadFrequency: values.uploadFrequency,
        publishTimes: values.publishTimes,
        ...(values.sourceChannelIds.length > 0 ? { sourceChannelIds: values.sourceChannelIds } : {}),
        ...(values.backgroundFootageSourceId
          ? { backgroundFootageSourceId: values.backgroundFootageSourceId }
          : {}),
        ...(values.type === 'reup'
          ? {
              reupVideoSourceId: values.reupVideoSourceId,
              reupAudioSourceId: values.reupAudioSourceId,
            }
          : {}),
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
            disabled={isSubmitting || optionsLoading || !formReady || mailOptions.length === 0}
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
        <FormField label="Linked Email" htmlFor="edit-mail-account" error={errors.mailAccountId?.message} className="min-w-0">
          <Controller
            name="mailAccountId"
            control={control}
            rules={{ required: 'Email is required' }}
            render={({ field }) => (
              <Select
                id="edit-mail-account"
                options={mailOptions}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={
                  optionsLoading
                    ? 'Loading emails...'
                    : mailOptions.length === 0
                      ? 'No available email accounts'
                      : 'Select email account'
                }
                searchPlaceholder="Search email..."
                searchable
                disabled={isSubmitting || optionsLoading || mailOptions.length === 0}
                className="w-full"
                triggerClassName={selectTriggerClass}
              />
            )}
          />
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

        <FormField label="Background Footage" htmlFor="edit-background-footage" optional className="min-w-0">
          <Controller
            name="backgroundFootageSourceId"
            control={control}
            render={({ field }) => (
              <Select
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
                triggerClassName={selectTriggerClass}
              />
            )}
          />
        </FormField>

        {channelType === 'reup' ? (
          <>
            <FormField
              label="Video Source"
              htmlFor="edit-reup-video-source"
              error={errors.reupVideoSourceId?.message}
              className="min-w-0"
            >
              <Controller
                name="reupVideoSourceId"
                control={control}
                rules={{ required: channelType === 'reup' ? 'Video source is required' : false }}
                render={({ field }) => (
                  <Select
                    id="edit-reup-video-source"
                    options={reupSourceOptions}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder={optionsLoading ? 'Loading sources...' : 'Select video source'}
                    searchPlaceholder="Search video sources..."
                    searchable
                    disabled={isSubmitting || optionsLoading}
                    className="w-full"
                    triggerClassName={selectTriggerClass}
                  />
                )}
              />
            </FormField>

            <FormField
              label="Audio Source"
              htmlFor="edit-reup-audio-source"
              error={errors.reupAudioSourceId?.message}
              className="min-w-0"
            >
              <Controller
                name="reupAudioSourceId"
                control={control}
                rules={{
                  required: channelType === 'reup' ? 'Audio source is required' : false,
                  validate: (value, formValues) =>
                    channelType !== 'reup' ||
                    !value ||
                    value !== formValues.reupVideoSourceId ||
                    'Video and audio sources must be different',
                }}
                render={({ field }) => (
                  <Select
                    id="edit-reup-audio-source"
                    options={reupSourceOptions}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder={optionsLoading ? 'Loading sources...' : 'Select audio source'}
                    searchPlaceholder="Search audio sources..."
                    searchable
                    disabled={isSubmitting || optionsLoading}
                    className="w-full"
                    triggerClassName={selectTriggerClass}
                  />
                )}
              />
            </FormField>
          </>
        ) : null}

        <FormField label="Source Channels" htmlFor="edit-source-channel" optional className="min-w-0 sm:col-span-2">
          <Controller
            name="sourceChannelIds"
            control={control}
            render={({ field }) => (
              <MultiSelect
                id="edit-source-channel"
                options={sourceOptions}
                value={field.value}
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
      </form>
    </Modal>
  );
}
