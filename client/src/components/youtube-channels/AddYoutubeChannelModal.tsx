import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { fetchMailAccounts } from '../../api/mailAccounts';
import { fetchNiches } from '../../api/niches';
import { fetchThumbnailStyles } from '../../api/prompts';
import { fetchSourceChannels } from '../../api/sourceChannels';
import { createYoutubeChannel, fetchYoutubeChannels, updateYoutubeChannel } from '../../api/youtubeChannels';
import {
  createEmptyPublishTimes,
  getChannelUploadTimes,
  getPublishTimeSlotCount,
  REUP_AUDIO_BACKGROUND_IMAGE_OPTIONS,
  REUP_AUDIO_VIDEO_TYPE_OPTIONS,
  CAPTION_STYLE_OPTIONS,
  UPLOAD_FREQUENCY_OPTIONS,
  YOUTUBE_CHANNEL_LANGUAGE_OPTIONS,
  YOUTUBE_CHANNEL_TYPE_OPTIONS,
} from '../../constants/youtubeChannelForm';
import { useAbortableEffect } from '../../hooks';
import type { Niche } from '../../types/niche';
import type { SourceChannel } from '../../types/sourceChannel';
import type {
  AddYoutubeChannelFormValues,
  StoredYoutubeChannelType,
  YoutubeChannel,
  YoutubeChannelLanguage,
} from '../../types/youtubeChannel';
import { BACKGROUND_FOOTAGE_LOCAL_SENTINEL } from '../../types/youtubeChannel';
import {
  isReupAudioChannelType,
  isReupYoutubeChannelType,
  parseStoredChannelLanguage,
} from '../../types/youtubeChannel';
import { buildBackgroundFootageSelectValue, handleBackgroundFootageSelectChange } from '../../utils/backgroundFootage';
import { formatSourceChannelOptionLabel } from '../../utils/niche';
import { loadReupAudioVideoStyleOptions } from '../../utils/youtubeChannel';
import { Button, Input, Modal, MultiSelect, Select, Textarea } from '../ui';

interface YoutubeChannelModalCommonProps {
  open: boolean;
  onClose: () => void;
}

interface AddYoutubeChannelModalProps extends YoutubeChannelModalCommonProps {
  channel?: undefined;
  onSuccess: () => void;
}

interface YoutubeChannelModalEditProps extends YoutubeChannelModalCommonProps {
  channel: YoutubeChannel;
  onSuccess: (channel: YoutubeChannel) => void;
}

type YoutubeChannelModalProps = AddYoutubeChannelModalProps | YoutubeChannelModalEditProps;

function isEditModalProps(props: YoutubeChannelModalProps): props is YoutubeChannelModalEditProps {
  return props.channel !== undefined;
}

const DEFAULT_THUMBNAIL_STYLE_OPTION = { value: '', label: 'Mặc định' };

const CHANNEL_TYPE_OPTIONS = YOUTUBE_CHANNEL_TYPE_OPTIONS.map(option => ({
  ...option,
  label: {
    content: 'Nội dung',
    reup_audio: 'Sử dụng lại âm thanh',
    reup_video: 'Sử dụng lại video',
    content_sale: 'Nội dung bán hàng',
  }[option.value],
}));

const LANGUAGE_OPTIONS = YOUTUBE_CHANNEL_LANGUAGE_OPTIONS.map(option => ({
  ...option,
  label: {
    en: 'Tiếng Anh',
    ko: 'Tiếng Hàn',
    ja: 'Tiếng Nhật',
    es: 'Tiếng Tây Ban Nha',
  }[option.value],
}));

const AUDIO_VIDEO_TYPE_OPTIONS = REUP_AUDIO_VIDEO_TYPE_OPTIONS.map(option => ({
  ...option,
  label: {
    si: 'Video cảnh nền + hình ảnh',
    ai: 'Hình ảnh chuyển động',
  }[option.value],
}));

const AUDIO_BACKGROUND_IMAGE_OPTIONS = REUP_AUDIO_BACKGROUND_IMAGE_OPTIONS.map(option => ({
  ...option,
  label: {
    no_image: 'Không dùng hình ảnh',
    local_image: 'Hình ảnh trên máy',
    one_image: 'Một hình ảnh',
    multi_image: 'Nhiều hình ảnh',
  }[option.value],
}));

const VI_CAPTION_STYLE_OPTIONS = CAPTION_STYLE_OPTIONS.map(option => ({
  ...option,
  label: {
    default: 'Mặc định (Noto Sans, trắng)',
    bizudp_gothic: 'BIZ UDPGothic',
    zen_kaku: 'Zen Kaku Gothic New',
    noto_serif: 'Noto Serif JP',
    cyan: 'Chữ màu lục lam',
    cyan_navy: 'Chữ lục lam + viền xanh navy',
    yellow: 'Chữ màu vàng',
  }[option.value],
}));

const VI_UPLOAD_FREQUENCY_OPTIONS = UPLOAD_FREQUENCY_OPTIONS.map(option => ({
  ...option,
  label: {
    every_5_days: '1 video mỗi 5 ngày',
    every_3_days: '1 video mỗi 3 ngày',
    every_2_days: '1 video mỗi 2 ngày',
    daily_1: '1 video mỗi ngày',
    daily_2: '2 video mỗi ngày',
    daily_3: '3 video mỗi ngày',
  }[option.value],
}));

function getVideoStylePlaceholder(videoType: string, loading: boolean, optionCount: number) {
  if (loading) return 'Đang tải kiểu video...';
  if (!videoType) return 'Chọn loại video trước';
  if (optionCount === 0) return 'Không có kiểu video khả dụng';
  return 'Chọn kiểu video';
}

const defaultValues: AddYoutubeChannelFormValues = {
  mailAccountId: 'default',
  channelUrl: '',
  type: 'reup_audio',
  language: '',
  niche: '',
  sourceChannels: [],
  backgroundFootageSources: [],
  backgroundFootageMode: 'source',
  thumbnailStyleKey: '',
  captionStyleKey: 'default',
  reupAudioVideoType: '',
  reupAudioVisualStyleId: '',
  reupAudioBackgroundImage: '',
  showAudioBar: false,
  showDisclaimer: false,
  disclaimerText: '',
  uploadFrequency: '',
  publishTimes: [],
};

function normalizeChannelType(type: StoredYoutubeChannelType): AddYoutubeChannelFormValues['type'] {
  return type === 'reup' ? 'reup_video' : type;
}

function getChannelFormValues(channel: YoutubeChannel, mailAccountId: string): AddYoutubeChannelFormValues {
  const frequency = channel.uploadFrequency ?? '';
  const slotCount = getPublishTimeSlotCount(frequency);
  const savedTimes = getChannelUploadTimes(channel);

  return {
    mailAccountId,
    channelUrl: channel.youtubeUrl,
    type: normalizeChannelType(channel.type),
    language: parseStoredChannelLanguage(channel.language),
    niche: channel.niche ?? '',
    sourceChannels: channel.sourceChannels ?? [],
    backgroundFootageSources: channel.backgroundFootageSources ?? [],
    backgroundFootageMode: channel.backgroundFootageMode ?? 'source',
    thumbnailStyleKey: channel.thumbnailStyleKey ?? '',
    captionStyleKey: channel.captionStyleKey ?? 'default',
    reupAudioVideoType: channel.reupAudioVideoType ?? '',
    reupAudioVisualStyleId: channel.reupAudioVisualStyleId ?? '',
    reupAudioBackgroundImage: channel.reupAudioBackgroundImage ?? '',
    showAudioBar: channel.showAudioBar === true,
    showDisclaimer: channel.showDisclaimer === true,
    disclaimerText: channel.disclaimerText ?? '',
    uploadFrequency: frequency,
    publishTimes: savedTimes.length === slotCount ? savedTimes : createEmptyPublishTimes(slotCount),
  };
}

function toSourceOption(source: SourceChannel, niches: Niche[]) {
  return {
    value: source.id,
    label: formatSourceChannelOptionLabel(source, niches),
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
      <label htmlFor={htmlFor} className='mb-1.5 block text-xs font-medium text-neutral-400'>
        {label}
        {optional ? <span className='text-neutral-500'> (không bắt buộc)</span> : null}
      </label>
      {children}
      {error ? <p className='mt-1 text-xs text-danger'>{error}</p> : null}
    </div>
  );
}

export function AddYoutubeChannelModal(props: YoutubeChannelModalProps) {
  const { open, onClose, channel } = props;
  const isEdit = channel !== undefined;
  const [apiError, setApiError] = useState<string | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [mailOptions, setMailOptions] = useState<{ value: string; label: string }[]>([]);
  const [sources, setSources] = useState<SourceChannel[]>([]);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [formReady, setFormReady] = useState(false);
  const [thumbnailStyleOptions, setThumbnailStyleOptions] = useState<{ value: string; label: string }[]>([DEFAULT_THUMBNAIL_STYLE_OPTION]);
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
  const mailAccountId = watch('mailAccountId');
  const isReupType = isReupYoutubeChannelType(channelType);
  const isReupAudio = isReupAudioChannelType(channelType);
  const language = watch('language') as YoutubeChannelLanguage | '';
  const reupAudioVideoType = watch('reupAudioVideoType');
  const showDisclaimer = watch('showDisclaimer');
  const uploadFrequency = watch('uploadFrequency');
  const backgroundFootageMode = watch('backgroundFootageMode');
  const publishTimeSlotCount = getPublishTimeSlotCount(uploadFrequency);

  const sourceOptions = useMemo(
    () => sources.filter(s => s.purpose !== 'background_footage').map(s => toSourceOption(s, niches)),
    [sources, niches],
  );
  const backgroundFootageOptions = useMemo(
    () => [
      { value: BACKGROUND_FOOTAGE_LOCAL_SENTINEL, label: 'Trên máy' },
      ...sources.filter(s => s.purpose === 'background_footage').map(s => toSourceOption(s, niches)),
    ],
    [sources, niches],
  );
  const nicheOptions = useMemo(() => niches.map(item => ({ value: item.key, label: item.label })), [niches]);

  useAbortableEffect(
    async signal => {
      if (!open) {
        setFormReady(false);
        return;
      }

      setOptionsLoading(true);
      setFormReady(false);

      try {
        const [mails, sourceList, nicheList] = await Promise.all([
          fetchMailAccounts('', 1, 100, { signal }),
          fetchSourceChannels('all', 'all', 'all', '', 1, 100, { signal }),
          fetchNiches({ signal }),
        ]);

        setSources(sourceList.items);
        setNiches(nicheList.items);

        if (channel) {
          const mailAccount = mails.items.find(
            account => account.email.toLowerCase() === channel.linkedEmail.toLowerCase(),
          );
          const mailAccountId =
            mailAccount?.id ?? (channel.linkedEmail.toLowerCase() === 'default' ? 'default' : '');
          setMailOptions([]);
          reset(getChannelFormValues(channel, mailAccountId));
        } else {
          const channels = await fetchYoutubeChannels('all', 'all', '', 1, 100, { signal });
          const usedEmails = new Set(channels.items.map(item => item.linkedEmail.toLowerCase()));
          const availableMailOptions = [
            ...(!usedEmails.has('default') ? [{ value: 'default', label: 'Mặc định' }] : []),
            ...mails.items
              .filter(account => !usedEmails.has(account.email.toLowerCase()))
              .map(account => ({ value: account.id, label: account.email })),
          ];

          setMailOptions(availableMailOptions);
          reset({
            ...defaultValues,
            mailAccountId: availableMailOptions[0]?.value ?? '',
          });
        }
        setFormReady(true);
      } catch {
        if (signal.aborted) return;
        setMailOptions([]);
        setSources([]);
        setNiches([]);
        reset(defaultValues);
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
  }, [publishTimeSlotCount, formReady, getValues, setValue]);

  useEffect(() => {
    if (!formReady || isReupAudio) return;
    setValue('reupAudioVideoType', '');
    setValue('reupAudioVisualStyleId', '');
    setValue('reupAudioBackgroundImage', '');
    setValue('showAudioBar', false);
    setValue('captionStyleKey', '');
  }, [isReupAudio, formReady, setValue]);

  useEffect(() => {
    if (!formReady || !isReupAudio || !reupAudioVideoType) return;
    if (reupAudioVideoType === 'si') {
      setValue('reupAudioVisualStyleId', '');
    } else if (reupAudioVideoType === 'ai') {
      setValue('reupAudioBackgroundImage', '');
      setValue('showAudioBar', false);
    }
  }, [formReady, isReupAudio, reupAudioVideoType, setValue]);

  useAbortableEffect(
    async signal => {
      if (!open || !formReady || !isReupAudio || reupAudioVideoType !== 'ai') {
        setVisualStyleOptions([]);
        if (formReady && reupAudioVideoType !== 'ai') {
          setValue('reupAudioVisualStyleId', '');
        }
        return;
      }

      setVisualStylesLoading(true);
      try {
        const options = await loadReupAudioVideoStyleOptions(reupAudioVideoType, language, { signal });
        setVisualStyleOptions(options);

        const current = getValues('reupAudioVisualStyleId');
        if (current && !options.some(option => option.value === current)) {
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
    [open, formReady, isReupAudio, reupAudioVideoType, language],
    { enabled: open && formReady },
  );

  useAbortableEffect(
    async signal => {
      if (!open || !formReady || !language) {
        setThumbnailStyleOptions([DEFAULT_THUMBNAIL_STYLE_OPTION]);
        return;
      }

      setThumbnailStylesLoading(true);
      try {
        const { items } = await fetchThumbnailStyles(language, { signal });
        const options = [DEFAULT_THUMBNAIL_STYLE_OPTION, ...items.map(item => ({ value: item.key, label: item.name }))];
        setThumbnailStyleOptions(options);

        const current = getValues('thumbnailStyleKey');
        if (current && !options.some(option => option.value === current)) {
          setValue('thumbnailStyleKey', '');
        }
      } catch {
        if (signal.aborted) return;
        setThumbnailStyleOptions([DEFAULT_THUMBNAIL_STYLE_OPTION]);
        setValue('thumbnailStyleKey', '');
      } finally {
        if (!signal.aborted) setThumbnailStylesLoading(false);
      }
    },
    [open, formReady, language],
    { enabled: open && formReady && Boolean(language) },
  );

  function handleClose() {
    reset(defaultValues);
    setFormReady(false);
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: AddYoutubeChannelFormValues) {
    if (!values.mailAccountId || !values.type || !values.uploadFrequency || !values.language || !values.niche) return;

    setApiError(null);
    try {
      const payload = {
        mailAccountId: values.mailAccountId,
        type: values.type,
        language: values.language,
        niche: values.niche,
        uploadFrequency: values.uploadFrequency,
        publishTimes: values.publishTimes,
        ...(values.sourceChannels.length > 0 ? { sourceChannels: values.sourceChannels } : {}),
        ...(values.backgroundFootageMode === 'local'
          ? { backgroundFootageMode: 'local' as const }
          : values.backgroundFootageSources.length > 0
            ? { backgroundFootageSources: values.backgroundFootageSources }
            : {}),
        ...(values.thumbnailStyleKey ? { thumbnailStyleKey: values.thumbnailStyleKey } : {}),
        ...(values.type === 'reup_audio' && values.reupAudioVideoType ? { reupAudioVideoType: values.reupAudioVideoType } : {}),
        ...(values.type === 'reup_audio' && values.reupAudioVisualStyleId ? { reupAudioVisualStyleId: values.reupAudioVisualStyleId } : {}),
        ...(values.type === 'reup_audio' && values.reupAudioVideoType === 'si' && values.reupAudioBackgroundImage
          ? { reupAudioBackgroundImage: values.reupAudioBackgroundImage }
          : {}),
        ...(values.type === 'reup_audio' && values.reupAudioVideoType === 'si' ? { showAudioBar: values.showAudioBar } : {}),
        ...(values.type === 'reup_audio' && values.captionStyleKey ? { captionStyleKey: values.captionStyleKey } : {}),
        showDisclaimer: values.showDisclaimer,
        disclaimerText: values.disclaimerText,
      };

      if (isEditModalProps(props)) {
        const { item } = await updateYoutubeChannel(props.channel.id, payload);
        props.onSuccess(item);
      } else {
        await createYoutubeChannel({
          ...payload,
          channelUrl: values.channelUrl.trim(),
        });
        props.onSuccess();
      }
      reset(defaultValues);
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : isEdit ? 'Không thể cập nhật kênh' : 'Không thể thêm kênh');
    }
  }

  const selectTriggerClass = 'h-10 w-full min-w-0 rounded-lg px-3 py-0';

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEdit ? 'Chỉnh sửa kênh YouTube' : 'Thêm kênh YouTube'}
      className='max-h-[90vh] max-w-5xl flex flex-col'
      bodyClassName='max-h-[60vh] overflow-y-auto'
      footer={
        <>
          <Button variant='outlined' size='sm' className='rounded-lg' onClick={handleClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button
            size='sm'
            className='rounded-lg'
            disabled={
              isSubmitting ||
              optionsLoading ||
              !formReady ||
              !mailAccountId ||
              (!isEdit && mailOptions.length === 0)
            }
            form='youtube-channel-form'
            type='submit'
          >
            {isSubmitting
              ? isEdit
                ? 'Đang lưu...'
                : 'Đang lấy thông tin kênh...'
              : isEdit
                ? 'Lưu thay đổi'
                : 'Thêm kênh'}
          </Button>
        </>
      }
    >
      <form
        id='youtube-channel-form'
        onSubmit={handleSubmit(onSubmit)}
        className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'
      >
        {channel ? (
          <>
            <FormField label='Email liên kết' className='min-w-0'>
              <div className='flex h-10 items-center rounded-lg border border-neutral-800 bg-surface-elevated px-3 text-sm text-neutral-300'>
                <span className='truncate'>{channel.linkedEmail}</span>
              </div>
            </FormField>
            <FormField label='Kênh' className='min-w-0'>
              <div className='flex h-10 items-center rounded-lg border border-neutral-800 bg-surface-elevated px-3 text-sm text-neutral-300'>
                <span className='truncate'>{channel.name}</span>
              </div>
            </FormField>
          </>
        ) : (
          <>
            <FormField
              label='Email liên kết'
              htmlFor='mail-account'
              error={errors.mailAccountId?.message}
              className='min-w-0'
            >
              <Controller
                name='mailAccountId'
                control={control}
                rules={{ required: 'Email là bắt buộc' }}
                render={({ field }) => (
                  <Select
                    id='mail-account'
                    options={mailOptions}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder={
                      optionsLoading
                        ? 'Đang tải email...'
                        : mailOptions.length === 0
                          ? 'Không có tài khoản email khả dụng'
                          : 'Chọn tài khoản email'
                    }
                    searchPlaceholder='Tìm kiếm email...'
                    searchable
                    disabled={isSubmitting || optionsLoading || mailOptions.length === 0}
                    className='w-full'
                    triggerClassName={selectTriggerClass}
                  />
                )}
              />
            </FormField>

            <FormField
              label='URL kênh'
              htmlFor='channel-url'
              optional
              error={errors.channelUrl?.message}
              className='min-w-0'
            >
              <Input
                id='channel-url'
                placeholder='https://youtube.com/@kenh hoặc @tenkenh'
                className='h-10 rounded-lg font-mono text-sm'
                disabled={isSubmitting}
                {...register('channelUrl')}
              />
            </FormField>
          </>
        )}

        <FormField label='Ngôn ngữ' htmlFor='channel-language' error={errors.language?.message} className='min-w-0'>
          <Controller
            name='language'
            control={control}
            rules={{ required: 'Ngôn ngữ là bắt buộc' }}
            render={({ field }) => (
              <Select
                id='channel-language'
                options={LANGUAGE_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder='Chọn ngôn ngữ'
                disabled={isSubmitting}
                className='w-full'
                triggerClassName={selectTriggerClass}
              />
            )}
          />
        </FormField>

        <FormField label='Chủ đề' htmlFor='channel-niche' error={errors.niche?.message} className='min-w-0'>
          <Controller
            name='niche'
            control={control}
            rules={{ required: 'Chủ đề là bắt buộc' }}
            render={({ field }) => (
              <Select
                id='channel-niche'
                options={nicheOptions}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={
                  optionsLoading
                    ? 'Đang tải chủ đề...'
                    : nicheOptions.length === 0
                      ? 'Chưa có chủ đề — hãy thêm chủ đề trước'
                      : 'Chọn chủ đề'
                }
                disabled={isSubmitting || optionsLoading || nicheOptions.length === 0}
                className='w-full'
                triggerClassName={selectTriggerClass}
              />
            )}
          />
        </FormField>

        <FormField label='Loại kênh' htmlFor='channel-type' error={errors.type?.message} className='min-w-0 sm:col-start-1'>
          <Controller
            name='type'
            control={control}
            rules={{ required: 'Loại kênh là bắt buộc' }}
            render={({ field }) => (
              <Select
                id='channel-type'
                options={CHANNEL_TYPE_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder='Chọn loại kênh'
                disabled={isSubmitting}
                className='w-full'
                triggerClassName={selectTriggerClass}
              />
            )}
          />
        </FormField>

        {isReupAudio ? (
          <>
            <FormField
              label='Loại hình ảnh video'
              htmlFor='reup-audio-video-type'
              error={errors.reupAudioVideoType?.message}
              className='min-w-0'
            >
              <Controller
                name='reupAudioVideoType'
                control={control}
                rules={{ required: isReupAudio ? 'Loại hình ảnh video là bắt buộc' : false }}
                render={({ field }) => (
                  <Select
                    id='reup-audio-video-type'
                    options={AUDIO_VIDEO_TYPE_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder='Chọn loại hình ảnh video'
                    disabled={isSubmitting}
                    className='w-full'
                    triggerClassName={selectTriggerClass}
                  />
                )}
              />
            </FormField>

            {reupAudioVideoType === 'si' ? (
              <>
                <FormField
                  label='Hình ảnh'
                  htmlFor='reup-audio-background-image'
                  error={errors.reupAudioBackgroundImage?.message}
                  className='min-w-0'
                >
                  <Controller
                    name='reupAudioBackgroundImage'
                    control={control}
                    rules={{
                      required:
                        isReupAudio && reupAudioVideoType === 'si' ? 'Hình ảnh là bắt buộc đối với Video tư liệu + hình ảnh' : false,
                    }}
                    render={({ field }) => (
                      <Select
                        id='reup-audio-background-image'
                        options={AUDIO_BACKGROUND_IMAGE_OPTIONS}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        placeholder='Chọn hình ảnh'
                        disabled={isSubmitting}
                        className='w-full'
                        triggerClassName={selectTriggerClass}
                      />
                    )}
                  />
                </FormField>
              </>
            ) : null}

            {reupAudioVideoType === 'ai' ? (
              <FormField
                label='Phong cách hình ảnh'
                htmlFor='reup-audio-visual-style'
                error={errors.reupAudioVisualStyleId?.message}
                className='min-w-0'
              >
                <Controller
                  name='reupAudioVisualStyleId'
                  control={control}
                  rules={{
                    required:
                      isReupAudio && reupAudioVideoType === 'ai' ? 'Phong cách hình ảnh là bắt buộc đối với Hình ảnh chuyển động' : false,
                  }}
                  render={({ field }) => (
                    <Select
                      id='reup-audio-visual-style'
                      options={visualStyleOptions}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      placeholder={getVideoStylePlaceholder(reupAudioVideoType, visualStylesLoading, visualStyleOptions.length)}
                      searchPlaceholder='Tìm kiếm phong cách hình ảnh...'
                      searchable
                      disabled={isSubmitting || visualStylesLoading || !reupAudioVideoType}
                      className='w-full'
                      triggerClassName={selectTriggerClass}
                    />
                  )}
                />
              </FormField>
            ) : null}
          </>
        ) : null}

        <FormField label='' htmlFor='reup-audio-show-audio-bar' className='min-w-0 sm:col-start-1'>
          <Controller
            name='showAudioBar'
            control={control}
            render={({ field }) => (
              <label htmlFor='reup-audio-show-audio-bar' className='flex cursor-pointer items-center gap-2 text-sm text-neutral-200'>
                <input
                  id='reup-audio-show-audio-bar'
                  type='checkbox'
                  checked={!!field.value}
                  onChange={e => field.onChange(e.target.checked)}
                  onBlur={field.onBlur}
                  disabled={isSubmitting}
                  className='h-4 w-4 rounded border-neutral-600 bg-neutral-900'
                />
                Hiển thị phổ âm thanh
              </label>
            )}
          />
        </FormField>

        <FormField label='Kiểu phụ đề' htmlFor='caption-style' optional error={errors.captionStyleKey?.message} className='min-w-0'>
          <Controller
            name='captionStyleKey'
            control={control}
            render={({ field }) => (
              <Select
                id='caption-style'
                options={VI_CAPTION_STYLE_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder='Chọn kiểu phụ đề'
                disabled={isSubmitting}
                className='w-full'
                triggerClassName={selectTriggerClass}
              />
            )}
          />
        </FormField>

        <FormField
          label='Kiểu ảnh thu nhỏ'
          htmlFor='thumbnail-style'
          optional
          error={errors.thumbnailStyleKey?.message}
          className='min-w-0'
        >
          <Controller
            name='thumbnailStyleKey'
            control={control}
            render={({ field }) => (
              <Select
                id='thumbnail-style'
                options={thumbnailStyleOptions}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={
                  !language
                    ? 'Chọn ngôn ngữ trước'
                    : thumbnailStylesLoading
                      ? 'Đang tải kiểu ảnh...'
                      : thumbnailStyleOptions.length === 0
                        ? 'Không có kiểu ảnh thu nhỏ cho ngôn ngữ này'
                        : 'Chọn kiểu ảnh thu nhỏ'
                }
                disabled={isSubmitting || !language || thumbnailStylesLoading}
                className='w-full'
                triggerClassName={selectTriggerClass}
              />
            )}
          />
        </FormField>

        <FormField
          label='Video cảnh nền'
          htmlFor='background-footage'
          optional
          className='min-w-0 sm:col-start-1 sm:col-span-2 lg:col-span-3'
        >
          <Controller
            name='backgroundFootageSources'
            control={control}
            render={({ field }) => (
              <MultiSelect
                id='background-footage'
                options={backgroundFootageOptions}
                value={buildBackgroundFootageSelectValue(backgroundFootageMode, field.value)}
                onChange={next => {
                  const resolved = handleBackgroundFootageSelectChange(
                    buildBackgroundFootageSelectValue(backgroundFootageMode, field.value),
                    next,
                  );
                  setValue('backgroundFootageMode', resolved.mode);
                  field.onChange(resolved.sourceIds);
                }}
                onBlur={field.onBlur}
                placeholder={optionsLoading ? 'Đang tải nguồn...' : 'Chọn video cảnh nền'}
                searchPlaceholder='Tìm kiếm video cảnh nền...'
                searchable
                disabled={isSubmitting || optionsLoading}
                className='w-full'
                triggerClassName='min-h-10 w-full min-w-0 rounded-lg px-2 py-1.5'
              />
            )}
          />
        </FormField>

        <FormField
          label='Kênh nguồn'
          htmlFor='source-channel'
          optional={!isReupType}
          error={errors.sourceChannels?.message}
          className='min-w-0 sm:col-start-1 sm:col-span-2 lg:col-span-3'
        >
          <Controller
            name='sourceChannels'
            control={control}
            rules={{
              validate: value => !isReupType || value.length > 0 || 'Kênh nguồn là bắt buộc',
            }}
            render={({ field }) => (
              <MultiSelect
                id='source-channel'
                options={sourceOptions}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={optionsLoading ? 'Đang tải nguồn...' : 'Chọn kênh nguồn'}
                searchPlaceholder='Tìm kiếm kênh nguồn...'
                searchable
                disabled={isSubmitting || optionsLoading}
                className='w-full'
                triggerClassName='min-h-10 w-full min-w-0 rounded-lg px-2 py-1.5'
              />
            )}
          />
        </FormField>

        <FormField label='' htmlFor='show-disclaimer' className='min-w-0 sm:col-start-1'>
          <Controller
            name='showDisclaimer'
            control={control}
            render={({ field }) => (
              <label htmlFor='show-disclaimer' className='flex cursor-pointer items-center gap-2 text-sm text-neutral-200'>
                <input
                  id='show-disclaimer'
                  type='checkbox'
                  checked={!!field.value}
                  onChange={e => field.onChange(e.target.checked)}
                  onBlur={field.onBlur}
                  disabled={isSubmitting}
                  className='h-4 w-4 rounded border-neutral-600 bg-neutral-900'
                />
                Hiển thị thông báo miễn trừ trách nhiệm
              </label>
            )}
          />
        </FormField>

        <FormField
          label='Nội dung miễn trừ trách nhiệm'
          htmlFor='disclaimer-text'
          optional
          error={errors.disclaimerText?.message}
          className='min-w-0 lg:col-span-2'
        >
          <Textarea
            id='disclaimer-text'
            rows={4}
            maxLength={2000}
            placeholder='Nhập nội dung miễn trừ trách nhiệm...'
            disabled={isSubmitting || !showDisclaimer}
            {...register('disclaimerText', {
              maxLength: {
                value: 2000,
                message: 'Nội dung miễn trừ trách nhiệm tối đa 2000 ký tự',
              },
            })}
          />
        </FormField>

        <FormField label='Tần suất đăng tải' htmlFor='upload-frequency' error={errors.uploadFrequency?.message} className='min-w-0'>
          <Controller
            name='uploadFrequency'
            control={control}
            rules={{ required: 'Tần suất đăng tải là bắt buộc' }}
            render={({ field }) => (
              <Select
                id='upload-frequency'
                options={VI_UPLOAD_FREQUENCY_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder='Chọn tần suất đăng tải'
                disabled={isSubmitting}
                className='w-full'
                triggerClassName={selectTriggerClass}
              />
            )}
          />
        </FormField>

        {publishTimeSlotCount > 0
          ? Array.from({ length: publishTimeSlotCount }).map((_, index) => (
              <FormField
                key={index}
                label={publishTimeSlotCount === 1 ? 'Giờ đăng' : `Giờ đăng ${index + 1}`}
                htmlFor={`publish-time-${index}`}
                error={errors.publishTimes?.[index]?.message}
                className='min-w-0'
              >
                <Input
                  id={`publish-time-${index}`}
                  type='time'
                  className='h-10 rounded-lg text-sm'
                  disabled={isSubmitting}
                  {...register(`publishTimes.${index}` as const, {
                    required: 'Giờ đăng là bắt buộc',
                  })}
                />
              </FormField>
            ))
          : null}

        {apiError ? <p className='text-xs text-danger sm:col-span-2 lg:col-span-3'>{apiError}</p> : null}
        {isEdit && !optionsLoading && formReady && !mailAccountId ? (
          <p className='text-xs text-danger sm:col-span-2 lg:col-span-3'>
            Không tìm thấy tài khoản email liên kết. Không thể lưu thay đổi.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
