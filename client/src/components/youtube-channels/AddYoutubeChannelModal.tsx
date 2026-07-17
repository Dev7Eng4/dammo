import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { fetchMailAccounts } from '../../api/mailAccounts';
import { fetchThumbnailStyles } from '../../api/prompts';
import { fetchSourceChannels } from '../../api/sourceChannels';
import { createYoutubeChannel, fetchYoutubeChannels } from '../../api/youtubeChannels';
import {
  createEmptyPublishTimes,
  getPublishTimeSlotCount,
  REUP_AUDIO_BACKGROUND_IMAGE_OPTIONS,
  REUP_AUDIO_VIDEO_TYPE_OPTIONS,
  CAPTION_STYLE_OPTIONS,
  UPLOAD_FREQUENCY_OPTIONS,
  YOUTUBE_CHANNEL_LANGUAGE_OPTIONS,
  YOUTUBE_CHANNEL_TYPE_OPTIONS,
} from '../../constants/youtubeChannelForm';
import { useAbortableEffect } from '../../hooks';
import type { SourceChannel } from '../../types/sourceChannel';
import type { YoutubeChannelLanguage } from '../../types/youtubeChannel';
import type { AddYoutubeChannelFormValues } from '../../types/youtubeChannel';
import { BACKGROUND_FOOTAGE_LOCAL_SENTINEL } from '../../types/youtubeChannel';
import { isReupAudioChannelType, isReupYoutubeChannelType } from '../../types/youtubeChannel';
import {
  buildBackgroundFootageSelectValue,
  handleBackgroundFootageSelectChange,
} from '../../utils/backgroundFootage';
import {
  getReupAudioVideoStylePlaceholder,
  loadReupAudioVideoStyleOptions,
} from '../../utils/youtubeChannel';
import { Button, Input, Modal, MultiSelect, Select } from '../ui';

interface AddYoutubeChannelModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const defaultValues: AddYoutubeChannelFormValues = {
  mailAccountId: 'default',
  channelUrl: '',
  type: '',
  language: '',
  sourceChannels: [],
  backgroundFootageSources: [],
  backgroundFootageMode: 'source',
  thumbnailStyleKey: '',
  captionStyleKey: 'default',
  reupAudioVideoType: '',
  reupAudioVisualStyleId: '',
  reupAudioBackgroundImage: '',
  showAudioBar: false,
  uploadFrequency: '',
  publishTimes: [],
};

function toSourceOption(source: SourceChannel) {
  return {
    value: source.id,
    label: `${source.name} (${source.url})`,
  };
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

export function AddYoutubeChannelModal({ open, onClose, onSuccess }: AddYoutubeChannelModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [mailOptions, setMailOptions] = useState<{ value: string; label: string }[]>([]);
  const [sources, setSources] = useState<SourceChannel[]>([]);
  const [thumbnailStyleOptions, setThumbnailStyleOptions] = useState<{ value: string; label: string }[]>([]);
  const [thumbnailStylesLoading, setThumbnailStylesLoading] = useState(false);
  const [visualStyleOptions, setVisualStyleOptions] = useState<{ value: string; label: string }[]>([]);
  const [visualStylesLoading, setVisualStylesLoading] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AddYoutubeChannelFormValues>({
    defaultValues,
  });

  const channelType = watch('type');
  const isReupType = isReupYoutubeChannelType(channelType);
  const isReupAudio = isReupAudioChannelType(channelType);
  const language = watch('language') as YoutubeChannelLanguage | '';
  const reupAudioVideoType = watch('reupAudioVideoType');
  const uploadFrequency = watch('uploadFrequency');
  const publishTimeSlotCount = getPublishTimeSlotCount(uploadFrequency);

  const sourceOptions = useMemo(
    () => sources.filter((s) => s.purpose !== 'background_footage').map(toSourceOption),
    [sources],
  );
  const backgroundFootageOptions = useMemo(
    () => [
      { value: BACKGROUND_FOOTAGE_LOCAL_SENTINEL, label: 'Local' },
      ...sources.filter((s) => s.purpose === 'background_footage').map(toSourceOption),
    ],
    [sources],
  );

  useAbortableEffect(
    async (signal) => {
      setOptionsLoading(true);

      try {
        const [mails, sourceList, channels] = await Promise.all([
          fetchMailAccounts('', 1, 100, { signal }),
          fetchSourceChannels('all', 'all', 'all', '', 1, 100, { signal }),
          fetchYoutubeChannels('all', 'all', '', 1, 100, { signal }),
        ]);

        const usedEmails = new Set(
          channels.items.map((channel) => channel.linkedEmail.toLowerCase()),
        );

        setMailOptions([
          { value: 'default', label: 'Default' },
          ...mails.items
            .filter((account) => !usedEmails.has(account.email.toLowerCase()))
            .map((account) => ({
              value: account.id,
              label: account.email,
            })),
        ]);
        setSources(sourceList.items);
      } catch {
        if (signal.aborted) return;
        setMailOptions([{ value: 'default', label: 'Default' }]);
        setSources([]);
      } finally {
        if (!signal.aborted) setOptionsLoading(false);
      }
    },
    [open],
    { enabled: open },
  );

  useEffect(() => {
    setValue('publishTimes', createEmptyPublishTimes(publishTimeSlotCount));
  }, [publishTimeSlotCount, setValue]);

  useEffect(() => {
    if (!isReupAudio) {
      setValue('reupAudioVideoType', '');
      setValue('reupAudioVisualStyleId', '');
      setValue('reupAudioBackgroundImage', '');
      setValue('showAudioBar', false);
      setValue('captionStyleKey', '');
    }
  }, [isReupAudio, setValue]);

  useEffect(() => {
    if (!isReupAudio || !reupAudioVideoType) return;
    if (reupAudioVideoType === 'si') {
      setValue('reupAudioVisualStyleId', '');
    } else if (reupAudioVideoType === 'ai') {
      setValue('reupAudioBackgroundImage', '');
      setValue('showAudioBar', false);
    }
  }, [isReupAudio, reupAudioVideoType, setValue]);

  useAbortableEffect(
    async (signal) => {
      if (!open || !isReupAudio || reupAudioVideoType !== 'ai') {
        setVisualStyleOptions([]);
        if (reupAudioVideoType !== 'ai') {
          setValue('reupAudioVisualStyleId', '');
        }
        return;
      }

      setVisualStylesLoading(true);
      try {
        const options = await loadReupAudioVideoStyleOptions(reupAudioVideoType, language, { signal });
        setVisualStyleOptions(options);

        const current = getValues('reupAudioVisualStyleId');
        if (current && !options.some((option) => option.value === current)) {
          setValue('reupAudioVisualStyleId', '');
        }
      } catch {
        if (signal.aborted) return;
        setVisualStyleOptions([]);
        setValue('reupAudioVisualStyleId', '');
      } finally {
        if (!signal.aborted) setVisualStylesLoading(false);
      }
    },
    [open, isReupAudio, reupAudioVideoType, language],
    { enabled: open },
  );

  useAbortableEffect(
    async (signal) => {
      if (!language) {
        setThumbnailStyleOptions([]);
        setValue('thumbnailStyleKey', '');
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
        setValue('thumbnailStyleKey', '');
      } finally {
        if (!signal.aborted) setThumbnailStylesLoading(false);
      }
    },
    [language],
    { enabled: open },
  );

  function handleClose() {
    reset(defaultValues);
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: AddYoutubeChannelFormValues) {
    if (!values.type || !values.uploadFrequency || !values.language) return;

    setApiError(null);
    try {
      await createYoutubeChannel({
        mailAccountId: values.mailAccountId,
        channelUrl: values.channelUrl.trim(),
        type: values.type,
        language: values.language,
        uploadFrequency: values.uploadFrequency,
        publishTimes: values.publishTimes,
        ...(values.sourceChannels.length > 0 ? { sourceChannels: values.sourceChannels } : {}),
        ...(values.backgroundFootageMode === 'local'
          ? { backgroundFootageMode: 'local' as const }
          : values.backgroundFootageSources.length > 0
            ? { backgroundFootageSources: values.backgroundFootageSources }
            : {}),
        ...(values.thumbnailStyleKey ? { thumbnailStyleKey: values.thumbnailStyleKey } : {}),
        ...(values.type === 'reup_audio' && values.reupAudioVideoType
          ? { reupAudioVideoType: values.reupAudioVideoType }
          : {}),
        ...(values.type === 'reup_audio' && values.reupAudioVisualStyleId
          ? { reupAudioVisualStyleId: values.reupAudioVisualStyleId }
          : {}),
        ...(values.type === 'reup_audio' &&
        values.reupAudioVideoType === 'si' &&
        values.reupAudioBackgroundImage
          ? { reupAudioBackgroundImage: values.reupAudioBackgroundImage }
          : {}),
        ...(values.type === 'reup_audio' && values.reupAudioVideoType === 'si'
          ? { showAudioBar: values.showAudioBar }
          : {}),
        ...(values.type === 'reup_audio' && values.captionStyleKey
          ? { captionStyleKey: values.captionStyleKey }
          : {}),
      });
      reset(defaultValues);
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to create channel');
    }
  }

  const selectTriggerClass = 'h-10 w-full min-w-0 rounded-lg px-3 py-0';

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add YouTube Channel"
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
            disabled={isSubmitting || optionsLoading || mailOptions.length === 0}
            form="add-youtube-channel-form"
            type="submit"
          >
            {isSubmitting ? 'Fetching channel info...' : 'Add Channel'}
          </Button>
        </>
      }
    >
      <form
        id="add-youtube-channel-form"
        onSubmit={handleSubmit(onSubmit)}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <FormField label="Linked Email" htmlFor="mail-account" error={errors.mailAccountId?.message} className="min-w-0">
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

        <FormField label="Channel URL" htmlFor="channel-url" optional error={errors.channelUrl?.message} className="min-w-0">
          <Input
            id="channel-url"
            placeholder="https://youtube.com/@channel or @handle"
            className="h-10 rounded-lg font-mono text-sm"
            disabled={isSubmitting}
            {...register('channelUrl')}
          />
        </FormField>

        <FormField label="Channel Type" htmlFor="channel-type" error={errors.type?.message} className="min-w-0">
          <Controller
            name="type"
            control={control}
            rules={{ required: 'Channel type is required' }}
            render={({ field }) => (
              <Select
                id="channel-type"
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

        {isReupAudio ? (
          <>
            <FormField
              label="Video Type"
              htmlFor="reup-audio-video-type"
              error={errors.reupAudioVideoType?.message}
              className="min-w-0"
            >
              <Controller
                name="reupAudioVideoType"
                control={control}
                rules={{ required: isReupAudio ? 'Video type is required' : false }}
                render={({ field }) => (
                  <Select
                    id="reup-audio-video-type"
                    options={REUP_AUDIO_VIDEO_TYPE_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="Select video type"
                    disabled={isSubmitting}
                    className="w-full"
                    triggerClassName={selectTriggerClass}
                  />
                )}
              />
            </FormField>

            {reupAudioVideoType === 'si' ? (
              <FormField
                label="Background Image"
                htmlFor="reup-audio-background-image"
                error={errors.reupAudioBackgroundImage?.message}
                className="min-w-0"
              >
                <Controller
                  name="reupAudioBackgroundImage"
                  control={control}
                  rules={{
                    required:
                      isReupAudio && reupAudioVideoType === 'si'
                        ? 'Background image is required for Stock Video + Image'
                        : false,
                  }}
                  render={({ field }) => (
                    <Select
                      id="reup-audio-background-image"
                      options={REUP_AUDIO_BACKGROUND_IMAGE_OPTIONS}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      placeholder="Select background image"
                      disabled={isSubmitting}
                      className="w-full"
                      triggerClassName={selectTriggerClass}
                    />
                  )}
                />
              </FormField>

              <FormField label="Show Audio Bar" htmlFor="reup-audio-show-audio-bar" className="min-w-0">
                <Controller
                  name="showAudioBar"
                  control={control}
                  render={({ field }) => (
                    <label
                      htmlFor="reup-audio-show-audio-bar"
                      className="flex cursor-pointer items-center gap-2 text-sm text-neutral-200"
                    >
                      <input
                        id="reup-audio-show-audio-bar"
                        type="checkbox"
                        checked={!!field.value}
                        onChange={e => field.onChange(e.target.checked)}
                        onBlur={field.onBlur}
                        disabled={isSubmitting}
                        className="h-4 w-4 rounded border-neutral-600 bg-neutral-900"
                      />
                      Overlay audio bar on the left side of the video
                    </label>
                  )}
                />
              </FormField>
            ) : null}

            {reupAudioVideoType === 'ai' ? (
              <FormField
                label="Video Style"
                htmlFor="reup-audio-visual-style"
                error={errors.reupAudioVisualStyleId?.message}
                className="min-w-0"
              >
                <Controller
                  name="reupAudioVisualStyleId"
                  control={control}
                  rules={{
                    required:
                      isReupAudio && reupAudioVideoType === 'ai'
                        ? 'Video style is required for Animate Images (AI)'
                        : false,
                  }}
                  render={({ field }) => (
                    <Select
                      id="reup-audio-visual-style"
                      options={visualStyleOptions}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      placeholder={getReupAudioVideoStylePlaceholder(
                        reupAudioVideoType,
                        visualStylesLoading,
                        visualStyleOptions.length,
                      )}
                      searchPlaceholder="Search video styles..."
                      searchable
                      disabled={isSubmitting || visualStylesLoading || !reupAudioVideoType}
                      className="w-full"
                      triggerClassName={selectTriggerClass}
                    />
                  )}
                />
              </FormField>
            ) : null}

            <FormField
              label="Caption Style"
              htmlFor="caption-style"
              optional
              error={errors.captionStyleKey?.message}
              className="min-w-0"
            >
              <Controller
                name="captionStyleKey"
                control={control}
                render={({ field }) => (
                  <Select
                    id="caption-style"
                    options={CAPTION_STYLE_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="Select caption style"
                    disabled={isSubmitting}
                    className="w-full"
                    triggerClassName={selectTriggerClass}
                  />
                )}
              />
            </FormField>
          </>
        ) : null}

        <FormField
          label="Language"
          htmlFor="channel-language"
          error={errors.language?.message}
          className="min-w-0"
        >
          <Controller
            name="language"
            control={control}
            rules={{ required: 'Language is required' }}
            render={({ field }) => (
              <Select
                id="channel-language"
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
          htmlFor="thumbnail-style"
          optional
          error={errors.thumbnailStyleKey?.message}
          className="min-w-0"
        >
          <Controller
            name="thumbnailStyleKey"
            control={control}
            render={({ field }) => (
              <Select
                id="thumbnail-style"
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

        <FormField
          label="Background Footage"
          htmlFor="background-footage"
          optional
          className="min-w-0"
        >
          <Controller
            name="backgroundFootageSources"
            control={control}
            render={({ field }) => (
              <MultiSelect
                id="background-footage"
                options={backgroundFootageOptions}
                value={buildBackgroundFootageSelectValue(watch('backgroundFootageMode'), field.value)}
                onChange={(next) => {
                  const resolved = handleBackgroundFootageSelectChange(
                    buildBackgroundFootageSelectValue(watch('backgroundFootageMode'), field.value),
                    next,
                  );
                  setValue('backgroundFootageMode', resolved.mode);
                  field.onChange(resolved.sourceIds);
                }}
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
          htmlFor="source-channel"
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
                id="source-channel"
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
          htmlFor="upload-frequency"
          error={errors.uploadFrequency?.message}
          className="min-w-0"
        >
          <Controller
            name="uploadFrequency"
            control={control}
            rules={{ required: 'Upload frequency is required' }}
            render={({ field }) => (
              <Select
                id="upload-frequency"
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
                htmlFor={`publish-time-${index}`}
                error={errors.publishTimes?.[index]?.message}
                className="min-w-0"
              >
                <Input
                  id={`publish-time-${index}`}
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

        {apiError ? (
          <p className="text-xs text-danger sm:col-span-2">{apiError}</p>
        ) : null}
      </form>
    </Modal>
  );
}
