import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import { fetchAppSettings } from '../../api/appSettings';
import { fetchMailAccounts } from '../../api/mailAccounts';
import { fetchNiches } from '../../api/niches';
import { fetchThumbnailStyles } from '../../api/prompts';
import { fetchSourceChannels } from '../../api/sourceChannels';
import { fetchCelebrities } from '../../api/celebrities';
import { fetchSmallVideoGroups } from '../../api/small-video-groups';
import {
  createYoutubeChannel,
  fetchYoutubeChannelAvatars,
  fetchYoutubeChannels,
  updateYoutubeChannel,
  uploadYoutubeChannelAvatar,
  uploadYoutubeChannelAvatarTemp,
} from '../../api/youtubeChannels';
import {
  createEmptyPublishTimes,
  getChannelUploadTimes,
  getPublishTimeSlotCount,
  REUP_AUDIO_BACKGROUND_IMAGE_OPTIONS,
  REUP_AUDIO_VIDEO_TYPE_OPTIONS,
  CAPTION_STYLE_OPTIONS,
  UPLOAD_FREQUENCY_OPTIONS,
  VIDEO_CREATION_ORDER_OPTIONS,
  YOUTUBE_CHANNEL_LANGUAGE_OPTIONS,
  YOUTUBE_CHANNEL_TYPE_OPTIONS,
  CELEBRITY_EMPTY_SENTINEL,
  parseSiBackgroundImageValue,
  toSiBackgroundImageFormValue,
} from '../../constants/youtubeChannelForm';
import { useAbortableEffect } from '../../hooks';
import type { CelebrityListItem } from '../../types/celebrity';
import type { SmallVideoGroupListItem } from '../../types/smallVideoGroup';
import type { MailAccount } from '../../types/mailAccount';
import type { Niche } from '../../types/niche';
import type { SourceChannel } from '../../types/sourceChannel';
import type {
  AddYoutubeChannelFormValues,
  AiSceneDensityMaxSec,
  StoredYoutubeChannelType,
  YoutubeChannel,
  YoutubeChannelLanguage,
} from '../../types/youtubeChannel';
import {
  DEFAULT_AI_SCENE_DENSITY_MAX_SEC,
  isReupAudioChannelType,
  isReupYoutubeChannelType,
  parseStoredChannelLanguage,
  parseSmallVideoGroupId,
  SI_OVERLAY_AUTO_SENTINEL,
} from '../../types/youtubeChannel';
import {
  LOCAL_STOCK_SENTINEL,
  normalizeBackgroundFootageSourceIds,
} from '../../utils/backgroundFootage';
import { formatSourceChannelOptionLabel } from '../../utils/niche';
import { loadReupAudioVideoStyleOptions } from '../../utils/youtubeChannel';
import { Button, Input, Modal, MultiSelect, Select, Textarea, useToast } from '../ui';
import type { SelectOption } from '../ui';
import { AudioBarPickerModal } from './AudioBarPickerModal';
import { SmallVideoPickerModal } from './SmallVideoPickerModal';
import { SubscribePickerModal } from './SubscribePickerModal';
import { ThumbnailBackgroundPickerModal } from './ThumbnailBackgroundPickerModal';

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

function isDefaultLinkedEmail(email: string): boolean {
  return email.trim().toLowerCase() === 'default';
}

function buildAvailableMailOptions(
  mailAccounts: Pick<MailAccount, 'id' | 'email' | 'platformLinks'>[],
  usedEmails: Set<string>,
  defaultLabel: string,
): { value: string; label: string }[] {
  return [
    { value: 'default', label: defaultLabel },
    ...mailAccounts
      .filter(
        (account) =>
          !usedEmails.has(account.email.toLowerCase()) &&
          account.platformLinks.youtube !== 'deleted',
      )
      .map((account) => ({ value: account.id, label: account.email })),
  ];
}

type TFunc = (key: string, options?: Record<string, unknown>) => string;

function buildDefaultThumbnailStyleOption(t: TFunc) {
  return { value: '', label: t('form.thumbnailReuseOld') };
}

function buildChannelTypeOptions(t: TFunc) {
  return YOUTUBE_CHANNEL_TYPE_OPTIONS.map(option => ({
    ...option,
    label: {
      content: t('form.typeContent'),
      reup_audio: t('form.typeReupAudio'),
      reup_video: t('form.typeReupVideo'),
      content_sale: t('form.typeContentSale'),
    }[option.value],
  }));
}

function buildLanguageOptions(t: TFunc) {
  return YOUTUBE_CHANNEL_LANGUAGE_OPTIONS.map(option => ({
    ...option,
    label: {
      en: t('language.en'),
      ko: t('language.ko'),
      ja: t('language.ja'),
      es: t('language.es'),
    }[option.value],
  }));
}

function buildAudioVideoTypeOptions(t: TFunc) {
  return REUP_AUDIO_VIDEO_TYPE_OPTIONS.map(option => ({
    ...option,
    label: {
      si: t('form.videoSi'),
      ai: t('form.videoAi'),
    }[option.value],
  }));
}

function buildAudioBackgroundImageOptions(t: TFunc): SelectOption[] {
  return REUP_AUDIO_BACKGROUND_IMAGE_OPTIONS.map(option => ({
    value: option.value,
    label: {
      no_image: t('form.imgNone'),
      one_image: t('form.imgOne'),
      multi_image: t('form.imgMulti'),
    }[option.value],
    group: t('form.imgGroup'),
  }));
}

function buildLocalImageLegacyOption(t: TFunc): SelectOption {
  return {
    value: 'local_image',
    label: t('form.imgLocal'),
    group: t('form.imgGroup'),
  };
}

function buildUploadFrequencyOptions(t: TFunc) {
  return UPLOAD_FREQUENCY_OPTIONS.map(option => ({
    ...option,
    label: {
      every_5_days: t('form.freq.every5Days'),
      every_3_days: t('form.freq.every3Days'),
      every_2_days: t('form.freq.every2Days'),
      daily_1: t('form.freq.daily1'),
      daily_2: t('form.freq.daily2'),
      daily_3: t('form.freq.daily3'),
    }[option.value],
  }));
}

function buildVideoCreationOrderOptions(t: TFunc) {
  return VIDEO_CREATION_ORDER_OPTIONS.map(option => ({
    ...option,
    label: {
      oldest_first: t('form.order.oldestFirst'),
      newest_first: t('form.order.newestFirst'),
      lowest_views_first: t('form.order.lowestViews'),
      shortest_duration_first: t('form.order.shortest'),
    }[option.value],
  }));
}

function buildCaptionStyleOptions(t: TFunc) {
  return CAPTION_STYLE_OPTIONS.map(option =>
    option.value === 'default' ? { ...option, label: t('form.default') } : option,
  );
}

function getVideoStylePlaceholder(t: TFunc, videoType: string, loading: boolean, optionCount: number) {
  if (loading) return t('form.videoStyleLoading');
  if (!videoType) return t('form.videoStyleNeedType');
  if (optionCount === 0) return t('form.videoStyleEmpty');
  return t('form.videoStylePlaceholder');
}

const defaultValues: AddYoutubeChannelFormValues = {
  mailAccountId: 'default',
  channelUrl: '',
  type: 'reup_audio',
  language: '',
  niche: '',
  sourceChannels: [],
  videoCreationOrder: 'oldest_first',
  backgroundFootageSources: [],
  thumbnailStyleKey: '',
  thumbnailBackgroundFile: '',
  captionStyleKey: 'default',
  reupAudioVideoType: '',
  reupAudioVisualStyleId: '',
  reupAudioBackgroundImage: '',
  aiSceneDensityMaxSec: { ...DEFAULT_AI_SCENE_DENSITY_MAX_SEC },
  useReferenceImage: false,
  audioBarFile: '',
  showChannelAvatar: false,
  showSubscribe: false,
  subscribeFile: '',
  smallVideoFile: '',
  showDisclaimer: false,
  disclaimerText: '',
  descriptionDisclaimerText: '',
  uploadFrequency: '',
  publishTimes: [],
};

function normalizeChannelType(type: StoredYoutubeChannelType): AddYoutubeChannelFormValues['type'] {
  return type === 'reup' ? 'reup_video' : type;
}

function getChannelFormValues(
  channel: YoutubeChannel,
  mailAccountId: string,
  densityDefaults: AiSceneDensityMaxSec = DEFAULT_AI_SCENE_DENSITY_MAX_SEC,
): AddYoutubeChannelFormValues {
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
    videoCreationOrder: channel.videoCreationOrder ?? 'oldest_first',
    backgroundFootageSources: channel.backgroundFootageSources ?? [],
    thumbnailStyleKey: channel.thumbnailStyleKey ?? '',
    thumbnailBackgroundFile: channel.thumbnailBackgroundFile ?? '',
    captionStyleKey: channel.captionStyleKey ?? 'default',
    reupAudioVideoType: channel.reupAudioVideoType ?? '',
    reupAudioVisualStyleId: channel.reupAudioVisualStyleId ?? '',
    reupAudioBackgroundImage: toSiBackgroundImageFormValue(
      channel.reupAudioBackgroundImage,
      channel.celebrityId,
    ),
    aiSceneDensityMaxSec: {
      high: channel.aiSceneDensityMaxSec?.high ?? densityDefaults.high,
      medium: channel.aiSceneDensityMaxSec?.medium ?? densityDefaults.medium,
      low: channel.aiSceneDensityMaxSec?.low ?? densityDefaults.low,
    },
    useReferenceImage: channel.useReferenceImage === true,
    audioBarFile: channel.audioBarFile ?? '',
    showChannelAvatar: channel.showChannelAvatar === true,
    showSubscribe: channel.showSubscribe === true,
    subscribeFile: channel.subscribeFile ?? '',
    smallVideoFile: channel.smallVideoFile ?? '',
    showDisclaimer: channel.showDisclaimer === true,
    disclaimerText: channel.disclaimerText ?? '',
    descriptionDisclaimerText: channel.descriptionDisclaimerText ?? '',
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
  const { t: tCommon } = useTranslation('common');
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className='mb-1.5 block text-xs font-medium text-neutral-400'>
        {label}
        {optional ? <span className='text-neutral-500'> {tCommon('actions.optional')}</span> : null}
      </label>
      {children}
      {error ? <p className='mt-1 text-xs text-danger'>{error}</p> : null}
    </div>
  );
}

export function AddYoutubeChannelModal(props: YoutubeChannelModalProps) {
  const { open, onClose, channel } = props;
  const isEdit = channel !== undefined;
  const canEditEmail = !isEdit || isDefaultLinkedEmail(channel.linkedEmail);
  const { t } = useTranslation('youtube');
  const { t: tCommon } = useTranslation('common');
  const { toast } = useToast();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const channelTypeOptions = useMemo(() => buildChannelTypeOptions(t), [t]);
  const languageOptions = useMemo(() => buildLanguageOptions(t), [t]);
  const audioVideoTypeOptions = useMemo(() => buildAudioVideoTypeOptions(t), [t]);
  const audioBackgroundImageOptions = useMemo(() => buildAudioBackgroundImageOptions(t), [t]);
  const localImageLegacyOption = useMemo(() => buildLocalImageLegacyOption(t), [t]);
  const uploadFrequencyOptions = useMemo(() => buildUploadFrequencyOptions(t), [t]);
  const videoCreationOrderOptions = useMemo(() => buildVideoCreationOrderOptions(t), [t]);
  const captionStyleOptions = useMemo(() => buildCaptionStyleOptions(t), [t]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [mailOptions, setMailOptions] = useState<{ value: string; label: string }[]>([]);
  const [sources, setSources] = useState<SourceChannel[]>([]);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [formReady, setFormReady] = useState(false);
  const [thumbnailStyleOptions, setThumbnailStyleOptions] = useState<{ value: string; label: string }[]>([{ value: '', label: '' }]);
  const [thumbnailStyleFlags, setThumbnailStyleFlags] = useState<Record<string, boolean>>({});
  const [thumbnailStylesLoading, setThumbnailStylesLoading] = useState(false);
  const [visualStyleOptions, setVisualStyleOptions] = useState<{ value: string; label: string }[]>([]);
  const [visualStylesLoading, setVisualStylesLoading] = useState(false);
  const [celebritiesWithMedia, setCelebritiesWithMedia] = useState<CelebrityListItem[]>([]);
  const [celebritiesLoading, setCelebritiesLoading] = useState(false);
  const [smallVideoGroups, setSmallVideoGroups] = useState<SmallVideoGroupListItem[]>([]);
  const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false);
  const [tempBackgroundSessionId, setTempBackgroundSessionId] = useState(() => crypto.randomUUID());
  const [audioBarPickerOpen, setAudioBarPickerOpen] = useState(false);
  const [smallVideoPickerOpen, setSmallVideoPickerOpen] = useState(false);
  const [subscribePickerOpen, setSubscribePickerOpen] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarTempSessionId, setAvatarTempSessionId] = useState(() => crypto.randomUUID());
  const [hasTempAvatar, setHasTempAvatar] = useState(false);
  const [hasChannelAvatar, setHasChannelAvatar] = useState(false);
  const [sceneDensityDefaults, setSceneDensityDefaults] = useState<AiSceneDensityMaxSec>({
    ...DEFAULT_AI_SCENE_DENSITY_MAX_SEC,
  });

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
  const reupAudioBackgroundImage = watch('reupAudioBackgroundImage');
  const parsedBackgroundImage = useMemo(
    () => parseSiBackgroundImageValue(reupAudioBackgroundImage),
    [reupAudioBackgroundImage],
  );
  const useReferenceImage = watch('useReferenceImage');
  const canEditSceneDensity =
    isReupAudio && (reupAudioVideoType === 'ai' || parsedBackgroundImage.mode === 'multi_image');
  const showDisclaimer = watch('showDisclaimer');
  const uploadFrequency = watch('uploadFrequency');
  const thumbnailStyleKey = watch('thumbnailStyleKey');
  const thumbnailBackgroundFile = watch('thumbnailBackgroundFile');
  const audioBarFile = watch('audioBarFile');
  const smallVideoFile = watch('smallVideoFile');
  const smallVideoGroupId = parseSmallVideoGroupId(smallVideoFile);
  const smallVideoGroupName = smallVideoGroupId
    ? smallVideoGroups.find(group => group.id === smallVideoGroupId)?.name
    : undefined;
  const subscribeFile = watch('subscribeFile');
  const publishTimeSlotCount = getPublishTimeSlotCount(uploadFrequency);
  const showThumbnailBackgroundPicker = Boolean(thumbnailStyleKey && thumbnailStyleFlags[thumbnailStyleKey]);
  const canShowChannelAvatar = isEdit ? hasChannelAvatar : hasTempAvatar;

  const sourceOptions = useMemo(
    () => sources.filter(s => s.purpose !== 'background_footage').map(s => toSourceOption(s, niches)),
    [sources, niches],
  );
  const backgroundFootageOptions = useMemo(
    () => [
      { value: LOCAL_STOCK_SENTINEL, label: t('form.localStock') },
      ...sources.filter(s => s.purpose === 'background_footage').map(s => toSourceOption(s, niches)),
    ],
    [sources, niches],
  );
  const nicheOptions = useMemo(() => niches.map(item => ({ value: item.key, label: item.label })), [niches]);

  const siBackgroundImageOptions = useMemo(() => {
    const options: SelectOption[] = [...audioBackgroundImageOptions];
    if (parsedBackgroundImage.mode === 'local_image') {
      options.push(localImageLegacyOption);
    }
    if (celebritiesWithMedia.length > 0) {
      for (const celebrity of celebritiesWithMedia) {
        options.push({
          value: toSiBackgroundImageFormValue('celebrity', celebrity.id),
          label: celebrity.name,
          group: t('form.celebrityGroup'),
        });
      }
    } else {
      options.push({
        value: CELEBRITY_EMPTY_SENTINEL,
        label: t('form.celebrityEmpty'),
        group: t('form.celebrityGroup'),
        disabled: true,
      });
    }
    return options;
  }, [celebritiesWithMedia, parsedBackgroundImage.mode, audioBackgroundImageOptions, localImageLegacyOption, t]);

  useAbortableEffect(
    async signal => {
      if (!open) {
        setFormReady(false);
        return;
      }

      setOptionsLoading(true);
      setFormReady(false);

      try {
        const [mails, sourceList, nicheList, appSettingsResult] = await Promise.all([
          fetchMailAccounts('', 1, 100, { signal }),
          fetchSourceChannels('all', 'all', 'all', 1, 100, { signal }),
          fetchNiches({ signal }),
          fetchAppSettings({ signal }).catch(() => null),
        ]);

        const densityDefaults: AiSceneDensityMaxSec = appSettingsResult?.item.aiSceneDensityMaxSec
          ? { ...appSettingsResult.item.aiSceneDensityMaxSec }
          : { ...DEFAULT_AI_SCENE_DENSITY_MAX_SEC };
        setSceneDensityDefaults(densityDefaults);

        setSources(sourceList.items);
        setNiches(nicheList.items);

        if (channel) {
          const mailAccount = mails.items.find(account => account.email.toLowerCase() === channel.linkedEmail.toLowerCase());
          const mailAccountId = mailAccount?.id ?? (isDefaultLinkedEmail(channel.linkedEmail) ? 'default' : '');

          if (isDefaultLinkedEmail(channel.linkedEmail)) {
            const channels = await fetchYoutubeChannels('all', 'all', '', 1, 100, { signal });
            const usedEmails = new Set(channels.items.filter(item => item.id !== channel.id).map(item => item.linkedEmail.toLowerCase()));
            setMailOptions(buildAvailableMailOptions(mails.items, usedEmails, t('form.default')));
          } else {
            setMailOptions([]);
          }

          let avatarExists = false;
          try {
            const avatars = await fetchYoutubeChannelAvatars(channel.id, { signal });
            avatarExists = avatars.items.length > 0;
          } catch {
            avatarExists = false;
          }
          setHasChannelAvatar(avatarExists);
          setHasTempAvatar(false);

          const formValues = getChannelFormValues(channel, mailAccountId, densityDefaults);
          if (!avatarExists) {
            formValues.showChannelAvatar = false;
          }
          reset(formValues);
        } else {
          const channels = await fetchYoutubeChannels('all', 'all', '', 1, 100, { signal });
          const usedEmails = new Set(channels.items.map(item => item.linkedEmail.toLowerCase()));
          const availableMailOptions = buildAvailableMailOptions(mails.items, usedEmails, t('form.default'));

          setMailOptions(availableMailOptions);
          setHasChannelAvatar(false);
          setHasTempAvatar(false);
          reset({
            ...defaultValues,
            mailAccountId: availableMailOptions[0]?.value ?? '',
            aiSceneDensityMaxSec: { ...densityDefaults },
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
    setValue('useReferenceImage', false);
    setValue('audioBarFile', '');
    setValue('smallVideoFile', '');
    setValue('subscribeFile', '');
    setValue('showChannelAvatar', false);
    setValue('captionStyleKey', '');
  }, [isReupAudio, formReady, setValue]);

  useEffect(() => {
    if (!formReady || !isReupAudio || !reupAudioVideoType) return;
    if (reupAudioVideoType === 'ai') {
      setValue('reupAudioBackgroundImage', '');
      setValue('audioBarFile', '');
      setValue('subscribeFile', '');
    }
  }, [formReady, isReupAudio, reupAudioVideoType, setValue]);

  useEffect(() => {
    if (!formReady) return;
    if (canEditSceneDensity) return;
    setValue('aiSceneDensityMaxSec', { ...sceneDensityDefaults });
  }, [formReady, canEditSceneDensity, sceneDensityDefaults, setValue]);

  useAbortableEffect(
    async signal => {
      if (!open || !formReady || !isReupAudio || reupAudioVideoType !== 'si') {
        setCelebritiesWithMedia([]);
        return;
      }

      setCelebritiesLoading(true);
      try {
        const { items } = await fetchCelebrities({ signal });
        const withMedia = items
          .filter(item => item.mediaCount > 0)
          .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
        setCelebritiesWithMedia(withMedia);

        const current = getValues('reupAudioBackgroundImage');
        const parsed = parseSiBackgroundImageValue(current);
        if (
          parsed.mode === 'celebrity' &&
          parsed.celebrityId &&
          !withMedia.some(item => item.id === parsed.celebrityId)
        ) {
          setValue('reupAudioBackgroundImage', '');
        }
      } catch {
        if (signal.aborted) return;
        setCelebritiesWithMedia([]);
      } finally {
        if (!signal.aborted) setCelebritiesLoading(false);
      }
    },
    [open, formReady, isReupAudio, reupAudioVideoType],
    { enabled: open && formReady && isReupAudio && reupAudioVideoType === 'si' },
  );

  useAbortableEffect(
    async signal => {
      if (!open || !formReady || !isReupAudio) {
        setSmallVideoGroups([]);
        return;
      }

      try {
        const { items } = await fetchSmallVideoGroups({ signal });
        setSmallVideoGroups(items);
      } catch {
        if (signal.aborted) return;
        setSmallVideoGroups([]);
      }
    },
    [open, formReady, isReupAudio],
    { enabled: open && formReady && isReupAudio },
  );

  useAbortableEffect(
    async signal => {
      if (!open || !formReady || !isReupAudio || !reupAudioVideoType) {
        setVisualStyleOptions([]);
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
        setThumbnailStyleOptions([buildDefaultThumbnailStyleOption(t)]);
        setThumbnailStyleFlags({});
        return;
      }

      setThumbnailStylesLoading(true);
      try {
        const { items } = await fetchThumbnailStyles(language, { signal });
        const options = [buildDefaultThumbnailStyleOption(t), ...items.map(item => ({ value: item.key, label: item.name }))];
        const flags: Record<string, boolean> = {};
        for (const item of items) {
          flags[item.key] = item.useChannelBackgroundImage === true;
        }
        setThumbnailStyleOptions(options);
        setThumbnailStyleFlags(flags);

        const current = getValues('thumbnailStyleKey');
        if (current && !options.some(option => option.value === current)) {
          setValue('thumbnailStyleKey', '');
          setValue('thumbnailBackgroundFile', '');
        }
      } catch {
        if (signal.aborted) return;
        setThumbnailStyleOptions([buildDefaultThumbnailStyleOption(t)]);
        setThumbnailStyleFlags({});
        setValue('thumbnailStyleKey', '');
        setValue('thumbnailBackgroundFile', '');
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
    setBackgroundPickerOpen(false);
    setAudioBarPickerOpen(false);
    setSmallVideoPickerOpen(false);
    setSubscribePickerOpen(false);
    setTempBackgroundSessionId(crypto.randomUUID());
    setAvatarTempSessionId(crypto.randomUUID());
    setHasTempAvatar(false);
    setHasChannelAvatar(false);
    onClose();
  }

  async function handleAvatarUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      if (isEdit && channel) {
        await uploadYoutubeChannelAvatar(channel.id, file);
        setHasChannelAvatar(true);
      } else {
        await uploadYoutubeChannelAvatarTemp(avatarTempSessionId, file);
        setHasTempAvatar(true);
      }
      toast.success(t('form.avatarUploadSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('form.avatarUploadError'));
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  async function onSubmit(values: AddYoutubeChannelFormValues) {
    if (!values.mailAccountId || !values.type || !values.uploadFrequency || !values.language) return;

    setApiError(null);
    try {
      const payload = {
        mailAccountId: values.mailAccountId,
        type: values.type,
        language: values.language,
        niche: values.niche.trim(),
        uploadFrequency: values.uploadFrequency,
        publishTimes: values.publishTimes,
        ...(isReupYoutubeChannelType(values.type) ? { videoCreationOrder: values.videoCreationOrder } : {}),
        ...(values.sourceChannels.length > 0 ? { sourceChannels: values.sourceChannels } : {}),
        ...(values.backgroundFootageSources.length > 0
          ? { backgroundFootageSources: values.backgroundFootageSources }
          : {}),
        ...(values.thumbnailStyleKey ? { thumbnailStyleKey: values.thumbnailStyleKey } : {}),
        thumbnailBackgroundFile: values.thumbnailBackgroundFile || undefined,
        ...(values.type === 'reup_audio' && values.reupAudioVideoType ? { reupAudioVideoType: values.reupAudioVideoType } : {}),
        ...(values.type === 'reup_audio' && values.reupAudioVisualStyleId ? { reupAudioVisualStyleId: values.reupAudioVisualStyleId } : {}),
        ...(values.type === 'reup_audio' ? { useReferenceImage: values.useReferenceImage } : {}),
        ...(values.type === 'reup_audio' && values.reupAudioVideoType === 'si' && values.reupAudioBackgroundImage
          ? (() => {
              const parsed = parseSiBackgroundImageValue(values.reupAudioBackgroundImage);
              if (!parsed.mode || (parsed.mode === 'celebrity' && !parsed.celebrityId)) return {};
              return {
                reupAudioBackgroundImage: parsed.mode,
                ...(parsed.mode === 'celebrity' && parsed.celebrityId
                  ? { celebrityId: parsed.celebrityId }
                  : {}),
              };
            })()
          : {}),
        ...(values.type === 'reup_audio' &&
        (values.reupAudioVideoType === 'ai' ||
          parseSiBackgroundImageValue(values.reupAudioBackgroundImage).mode === 'multi_image')
          ? {
              aiSceneDensityMaxSec: {
                high: Number(values.aiSceneDensityMaxSec.high) || sceneDensityDefaults.high,
                medium: Number(values.aiSceneDensityMaxSec.medium) || sceneDensityDefaults.medium,
                low: Number(values.aiSceneDensityMaxSec.low) || sceneDensityDefaults.low,
              },
            }
          : {}),
        ...(values.type === 'reup_audio' && values.reupAudioVideoType === 'si'
          ? {
              ...(values.audioBarFile ? { audioBarFile: values.audioBarFile, showAudioBar: true } : { showAudioBar: false }),
              ...(values.subscribeFile ? { subscribeFile: values.subscribeFile, showSubscribe: true } : { showSubscribe: false }),
            }
          : {}),
        ...(values.type === 'reup_audio' &&
        (values.reupAudioVideoType === 'si' || values.reupAudioVideoType === 'ai')
          ? {
              ...(values.smallVideoFile
                ? { smallVideoFile: values.smallVideoFile, showSmallVideo: true }
                : { showSmallVideo: false }),
            }
          : {}),
        ...(values.type === 'reup_audio' && values.captionStyleKey ? { captionStyleKey: values.captionStyleKey } : {}),
        showChannelAvatar: values.showChannelAvatar === true && (isEdit ? hasChannelAvatar : hasTempAvatar),
        showDisclaimer: values.showDisclaimer,
        disclaimerText: values.disclaimerText,
        descriptionDisclaimerText: values.descriptionDisclaimerText,
      };

      if (isEditModalProps(props)) {
        const trimmedChannelUrl = values.channelUrl.trim();
        const shouldUpdateChannelUrl =
          trimmedChannelUrl.length > 0 &&
          trimmedChannelUrl !== props.channel.youtubeUrl &&
          trimmedChannelUrl !== props.channel.handle;
        const { item } = await updateYoutubeChannel(props.channel.id, {
          ...payload,
          ...(shouldUpdateChannelUrl ? { channelUrl: trimmedChannelUrl } : {}),
        });
        props.onSuccess(item);
      } else {
        await createYoutubeChannel({
          ...payload,
          channelUrl: values.channelUrl.trim(),
          thumbnailBackgroundTempSessionId: tempBackgroundSessionId,
          ...(hasTempAvatar ? { avatarTempSessionId } : {}),
        });
        props.onSuccess();
      }
      reset(defaultValues);
      setBackgroundPickerOpen(false);
      setTempBackgroundSessionId(crypto.randomUUID());
      setAvatarTempSessionId(crypto.randomUUID());
      setHasTempAvatar(false);
      setHasChannelAvatar(false);
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : isEdit ? t('form.updateError') : t('form.addError'));
    }
  }

  const selectTriggerClass = 'h-10 w-full min-w-0 rounded-lg px-3 py-0';

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        title={isEdit ? t('form.editTitle') : t('form.addTitle')}
        className='max-h-[90vh] max-w-5xl flex flex-col'
        bodyClassName='max-h-[60vh] overflow-y-auto'
        footer={
          <>
            <Button variant='outlined' size='sm' className='rounded-lg' onClick={handleClose} disabled={isSubmitting}>
              {tCommon('actions.cancel')}
            </Button>
            <Button
              size='sm'
              className='rounded-lg'
              disabled={
                isSubmitting ||
                optionsLoading ||
                !formReady ||
                !mailAccountId ||
                (!isEdit && mailOptions.length === 0) ||
                (canEditEmail && isEdit && mailOptions.length === 0)
              }
              form='youtube-channel-form'
              type='submit'
            >
              {isSubmitting ? (isEdit ? tCommon('actions.saving') : t('form.adding')) : isEdit ? t('form.saveChanges') : t('form.add')}
            </Button>
          </>
        }
      >
        <form id='youtube-channel-form' onSubmit={handleSubmit(onSubmit)} className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {canEditEmail ? (
            <FormField label={t('form.linkedEmail')} htmlFor='mail-account' error={errors.mailAccountId?.message} className='min-w-0'>
              <Controller
                name='mailAccountId'
                control={control}
                rules={{ required: t('form.linkedEmailRequired') }}
                render={({ field }) => (
                  <Select
                    id='mail-account'
                    options={mailOptions}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder={
                      optionsLoading
                        ? t('form.emailLoading')
                        : mailOptions.length === 0
                          ? t('form.emailEmpty')
                          : t('form.emailPlaceholder')
                    }
                    searchPlaceholder={t('form.emailSearch')}
                    searchable
                    disabled={isSubmitting || optionsLoading || mailOptions.length === 0}
                    className='w-full'
                    triggerClassName={selectTriggerClass}
                  />
                )}
              />
            </FormField>
          ) : (
            <FormField label={t('form.linkedEmail')} className='min-w-0'>
              <div className='flex h-10 items-center rounded-lg border border-neutral-800 bg-surface-elevated px-3 text-sm text-neutral-300'>
                <span className='truncate'>{channel!.linkedEmail}</span>
              </div>
            </FormField>
          )}

          <FormField label={t('form.channelUrl')} htmlFor='channel-url' optional error={errors.channelUrl?.message} className='min-w-0'>
            <Input
              id='channel-url'
              placeholder={t('form.channelUrlPlaceholder')}
              className='h-10 rounded-lg font-mono text-sm'
              disabled={isSubmitting}
              {...register('channelUrl')}
            />
          </FormField>
          <FormField label={t('form.language')} htmlFor='channel-language' error={errors.language?.message} className='min-w-0'>
            <Controller
              name='language'
              control={control}
              rules={{ required: t('form.languageRequired') }}
              render={({ field }) => (
                <Select
                  id='channel-language'
                  options={languageOptions}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder={t('form.languagePlaceholder')}
                  disabled={isSubmitting}
                  className='w-full'
                  triggerClassName={selectTriggerClass}
                />
              )}
            />
          </FormField>

          <FormField label={t('form.niche')} htmlFor='channel-niche' optional error={errors.niche?.message} className='min-w-0'>
            <Controller
              name='niche'
              control={control}
              render={({ field }) => (
                <Select
                  id='channel-niche'
                  options={nicheOptions}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  clearable
                  placeholder={
                    optionsLoading
                      ? t('form.nicheLoading')
                      : nicheOptions.length === 0
                        ? t('form.nicheEmpty')
                        : t('form.nichePlaceholder')
                  }
                  disabled={isSubmitting || optionsLoading}
                  className='w-full'
                  triggerClassName={selectTriggerClass}
                />
              )}
            />
          </FormField>

          {isReupType ? (
            <FormField
              label={t('form.videoOrder')}
              htmlFor='video-creation-order'
              error={errors.videoCreationOrder?.message}
              className='min-w-0'
            >
              <Controller
                name='videoCreationOrder'
                control={control}
                rules={{ required: isReupType ? t('form.videoOrderRequired') : false }}
                render={({ field }) => (
                  <Select
                    id='video-creation-order'
                    options={videoCreationOrderOptions}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder={t('form.videoOrderPlaceholder')}
                    disabled={isSubmitting}
                    className='w-full'
                    triggerClassName={selectTriggerClass}
                  />
                )}
              />
            </FormField>
          ) : null}

          <FormField
            label={t('form.sourceChannels')}
            htmlFor='source-channel'
            optional={!isReupType}
            error={errors.sourceChannels?.message}
            className='min-w-0 sm:col-start-1 sm:col-span-2 lg:col-span-3'
          >
            <Controller
              name='sourceChannels'
              control={control}
              rules={{
                validate: value => !isReupType || value.length > 0 || t('form.sourceRequired'),
              }}
              render={({ field }) => (
                <MultiSelect
                  id='source-channel'
                  options={sourceOptions}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder={optionsLoading ? t('form.sourceLoading') : t('form.sourcePlaceholder')}
                  searchPlaceholder={t('form.sourceSearch')}
                  searchable
                  disabled={isSubmitting || optionsLoading}
                  className='w-full'
                  triggerClassName='min-h-10 w-full min-w-0 rounded-lg px-2 py-1.5'
                />
              )}
            />
          </FormField>

          <FormField label={t('form.channelType')} htmlFor='channel-type' error={errors.type?.message} className='min-w-0 sm:col-start-1'>
            <Controller
              name='type'
              control={control}
              rules={{ required: t('form.channelTypeRequired') }}
              render={({ field }) => (
                <Select
                  id='channel-type'
                  options={channelTypeOptions}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder={t('form.channelTypePlaceholder')}
                  disabled={isSubmitting}
                  className='w-full'
                  triggerClassName={selectTriggerClass}
                />
              )}
            />
          </FormField>

          {isReupAudio ? (
            <>
              <FormField label={t('form.videoType')} htmlFor='reup-audio-video-type' error={errors.reupAudioVideoType?.message} className='min-w-0'>
                <Controller
                  name='reupAudioVideoType'
                  control={control}
                  rules={{ required: isReupAudio ? t('form.videoTypeRequired') : false }}
                  render={({ field }) => (
                    <Select
                      id='reup-audio-video-type'
                      options={audioVideoTypeOptions}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      placeholder={t('form.videoTypePlaceholder')}
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
                    label={t('form.images')}
                    htmlFor='reup-audio-background-image'
                    error={errors.reupAudioBackgroundImage?.message}
                    className='min-w-0'
                  >
                    <Controller
                      name='reupAudioBackgroundImage'
                      control={control}
                      rules={{
                        required:
                          isReupAudio && reupAudioVideoType === 'si' ? t('form.imagesRequired') : false,
                        validate: value => {
                          if (!value || value === CELEBRITY_EMPTY_SENTINEL) {
                            return isReupAudio && reupAudioVideoType === 'si'
                              ? t('form.imagesRequired')
                              : true;
                          }
                          return true;
                        },
                      }}
                      render={({ field }) => (
                        <Select
                          id='reup-audio-background-image'
                          options={siBackgroundImageOptions}
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          placeholder={celebritiesLoading ? t('form.imagesLoading') : t('form.imagesPlaceholder')}
                          searchable
                          searchPlaceholder={t('form.imagesSearch')}
                          disabled={isSubmitting || celebritiesLoading}
                          className='w-full'
                          triggerClassName={selectTriggerClass}
                        />
                      )}
                    />
                  </FormField>
                </>
              ) : null}

              <FormField
                label={t('form.bgFootage')}
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
                      value={field.value}
                      onChange={next => {
                        field.onChange(normalizeBackgroundFootageSourceIds(next));
                      }}
                      onBlur={field.onBlur}
                      placeholder={optionsLoading ? t('form.sourceLoading') : t('form.bgFootagePlaceholder')}
                      searchPlaceholder={t('form.bgFootageSearch')}
                      searchable
                      disabled={isSubmitting || optionsLoading}
                      className='w-full'
                      triggerClassName='min-h-10 w-full min-w-0 rounded-lg px-2 py-1.5'
                    />
                  )}
                />
              </FormField>

              <FormField
                label={t('form.visualStyle')}
                htmlFor='reup-audio-visual-style'
                error={errors.reupAudioVisualStyleId?.message}
                className='min-w-0 sm:col-start-1 sm:col-span-2'
              >
                <Controller
                  name='reupAudioVisualStyleId'
                  control={control}
                  rules={{
                    required:
                      isReupAudio &&
                      (reupAudioVideoType === 'ai' ||
                        parsedBackgroundImage.mode === 'multi_image' ||
                        useReferenceImage)
                        ? t('form.visualStyleRequired')
                        : false,
                  }}
                  render={({ field }) => (
                    <Select
                      id='reup-audio-visual-style'
                      options={visualStyleOptions}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      placeholder={getVideoStylePlaceholder(t, reupAudioVideoType, visualStylesLoading, visualStyleOptions.length)}
                      searchPlaceholder={t('form.visualStyleSearch')}
                      searchable
                      disabled={isSubmitting || visualStylesLoading || !reupAudioVideoType}
                      className='w-full'
                      triggerClassName={selectTriggerClass}
                    />
                  )}
                />
              </FormField>

              <FormField label='' htmlFor='reup-audio-use-reference-image' className='min-w-0 flex items-center'>
                <Controller
                  name='useReferenceImage'
                  control={control}
                  render={({ field }) => (
                    <label
                      htmlFor='reup-audio-use-reference-image'
                      className='flex cursor-pointer items-center gap-2 text-sm text-neutral-200'
                    >
                      <input
                        id='reup-audio-use-reference-image'
                        type='checkbox'
                        checked={!!field.value}
                        onChange={e => field.onChange(e.target.checked)}
                        onBlur={field.onBlur}
                        disabled={isSubmitting}
                        className='h-4 w-4 rounded border-neutral-600 bg-neutral-900'
                      />
                      {t('form.sceneRefImages')}
                    </label>
                  )}
                />
              </FormField>

              <div className='min-w-0 sm:col-start-1 sm:col-span-2'>
                <p className='mb-2 text-xs font-medium text-neutral-400'>{t('form.sceneDensity')}</p>
                <div className='grid grid-cols-3 gap-3'>
                  <FormField
                    label={t('form.sceneStart')}
                    htmlFor='ai-scene-density-high'
                    error={errors.aiSceneDensityMaxSec?.high?.message}
                    className='min-w-0'
                  >
                    <Input
                      id='ai-scene-density-high'
                      type='number'
                      min={1}
                      max={300}
                      className='h-10 rounded-lg'
                      disabled={isSubmitting || !canEditSceneDensity}
                      {...register('aiSceneDensityMaxSec.high', {
                        valueAsNumber: true,
                        required: canEditSceneDensity ? t('form.required') : false,
                        min: canEditSceneDensity ? { value: 1, message: t('form.min1') } : undefined,
                        max: canEditSceneDensity ? { value: 300, message: t('form.max300') } : undefined,
                      })}
                    />
                  </FormField>
                  <FormField
                    label={t('form.sceneMiddle')}
                    htmlFor='ai-scene-density-medium'
                    error={errors.aiSceneDensityMaxSec?.medium?.message}
                    className='min-w-0'
                  >
                    <Input
                      id='ai-scene-density-medium'
                      type='number'
                      min={1}
                      max={300}
                      className='h-10 rounded-lg'
                      disabled={isSubmitting || !canEditSceneDensity}
                      {...register('aiSceneDensityMaxSec.medium', {
                        valueAsNumber: true,
                        required: canEditSceneDensity ? t('form.required') : false,
                        min: canEditSceneDensity ? { value: 1, message: t('form.min1') } : undefined,
                        max: canEditSceneDensity ? { value: 300, message: t('form.max300') } : undefined,
                      })}
                    />
                  </FormField>
                  <FormField
                    label={t('form.sceneEnd')}
                    htmlFor='ai-scene-density-low'
                    error={errors.aiSceneDensityMaxSec?.low?.message}
                    className='min-w-0'
                  >
                    <Input
                      id='ai-scene-density-low'
                      type='number'
                      min={1}
                      max={300}
                      className='h-10 rounded-lg'
                      disabled={isSubmitting || !canEditSceneDensity}
                      {...register('aiSceneDensityMaxSec.low', {
                        valueAsNumber: true,
                        required: canEditSceneDensity ? t('form.required') : false,
                        min: canEditSceneDensity ? { value: 1, message: t('form.min1') } : undefined,
                        max: canEditSceneDensity ? { value: 300, message: t('form.max300') } : undefined,
                      })}
                    />
                  </FormField>
                </div>
              </div>
            </>
          ) : null}

          {isReupAudio ? (
            <FormField label={t('form.audioBar')} className='min-w-0 sm:col-start-1'>
              <Button
                type='button'
                variant='outlined'
                size='sm'
                className='h-10 w-full justify-start rounded-lg px-3 text-left font-normal'
                disabled={isSubmitting}
                onClick={() => setAudioBarPickerOpen(true)}
              >
                {audioBarFile === SI_OVERLAY_AUTO_SENTINEL
                  ? t('form.selectedAuto')
                  : audioBarFile
                    ? t('form.selectedFile', { file: audioBarFile })
                    : t('form.audioBarSelect')}
              </Button>
            </FormField>
          ) : null}

          {isReupAudio ? (
            <FormField label={t('form.smallVideo')} className='min-w-0'>
              <Button
                type='button'
                variant='outlined'
                size='sm'
                className='h-10 w-full justify-start rounded-lg px-3 text-left font-normal'
                disabled={isSubmitting}
                onClick={() => setSmallVideoPickerOpen(true)}
              >
                {smallVideoFile === SI_OVERLAY_AUTO_SENTINEL
                  ? t('form.selectedAuto')
                  : smallVideoGroupId
                    ? t('form.selectedGroup', { name: smallVideoGroupName ?? t('form.groupFallback') })
                    : smallVideoFile
                      ? t('form.selectedFile', { file: smallVideoFile })
                      : t('form.smallVideoSelect')}
              </Button>
            </FormField>
          ) : null}

          {isReupAudio ? (
            <FormField label={t('form.subscribe')} className='min-w-0'>
              <Button
                type='button'
                variant='outlined'
                size='sm'
                className='h-10 w-full justify-start rounded-lg px-3 text-left font-normal'
                disabled={isSubmitting}
                onClick={() => setSubscribePickerOpen(true)}
              >
                {subscribeFile === SI_OVERLAY_AUTO_SENTINEL
                  ? t('form.selectedAuto')
                  : subscribeFile
                    ? t('form.selectedFile', { file: subscribeFile })
                    : t('form.subscribeSelect')}
              </Button>
            </FormField>
          ) : null}

          <FormField label={t('form.captionStyle')} htmlFor='caption-style' optional error={errors.captionStyleKey?.message} className='min-w-0'>
            <Controller
              name='captionStyleKey'
              control={control}
              render={({ field }) => (
                <Select
                  id='caption-style'
                  options={captionStyleOptions}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder={t('form.captionStylePlaceholder')}
                  disabled={isSubmitting}
                  className='w-full'
                  triggerClassName={selectTriggerClass}
                />
              )}
            />
          </FormField>

          <FormField label='' htmlFor='show-channel-avatar' className='min-w-0 flex items-center'>
            <Controller
              name='showChannelAvatar'
              control={control}
              render={({ field }) => (
                <div className='flex items-center gap-2'>
                  <label
                    htmlFor='show-channel-avatar'
                    className={`flex items-center gap-2 text-sm text-neutral-200 ${
                      canShowChannelAvatar && !isSubmitting && !avatarUploading
                        ? 'cursor-pointer'
                        : 'cursor-not-allowed opacity-60'
                    }`}
                    title={canShowChannelAvatar ? undefined : t('form.uploadAvatarFirst')}
                  >
                    <input
                      id='show-channel-avatar'
                      type='checkbox'
                      checked={!!field.value && canShowChannelAvatar}
                      onChange={e => field.onChange(e.target.checked)}
                      onBlur={field.onBlur}
                      disabled={isSubmitting || avatarUploading || !canShowChannelAvatar}
                      className='h-4 w-4 rounded border-neutral-600 bg-neutral-900'
                    />
                    {t('form.showAvatar')}
                  </label>
                  <input
                    ref={avatarInputRef}
                    type='file'
                    accept='image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'
                    className='hidden'
                    onChange={e => {
                      void handleAvatarUpload(e.target.files);
                    }}
                  />
                  <Button
                    type='button'
                    variant='outlined'
                    size='sm'
                    className='h-8 rounded-md px-2 text-xs'
                    disabled={isSubmitting || avatarUploading}
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    {avatarUploading ? t('form.uploadingImage') : t('form.uploadImage')}
                  </Button>
                </div>
              )}
            />
          </FormField>

          <FormField
            label={t('form.thumbnailStyle')}
            htmlFor='thumbnail-style'
            // optional
            error={errors.thumbnailStyleKey?.message}
            className='min-w-0 sm:col-start-1'
          >
            <Controller
              name='thumbnailStyleKey'
              control={control}
              render={({ field }) => (
                <Select
                  id='thumbnail-style'
                  options={thumbnailStyleOptions}
                  value={field.value}
                  onChange={next => {
                    field.onChange(next);
                    if (!next || !thumbnailStyleFlags[next]) {
                      setValue('thumbnailBackgroundFile', '');
                    }
                  }}
                  onBlur={field.onBlur}
                  placeholder={
                    !language
                      ? t('form.thumbnailNeedLang')
                      : thumbnailStylesLoading
                        ? t('form.thumbnailLoading')
                        : thumbnailStyleOptions.length === 0
                          ? t('form.thumbnailEmpty')
                          : t('form.thumbnailPlaceholder')
                  }
                  disabled={isSubmitting || !language || thumbnailStylesLoading}
                  className='w-full'
                  triggerClassName={selectTriggerClass}
                />
              )}
            />
          </FormField>

          {showThumbnailBackgroundPicker ? (
            <FormField label={t('form.thumbnailBg')} className='min-w-0'>
              <div className='flex flex-col gap-2'>
                <Button
                  type='button'
                  variant='outlined'
                  size='sm'
                  className='h-10 w-full justify-start rounded-lg px-3 text-left font-normal'
                  disabled={isSubmitting}
                  onClick={() => setBackgroundPickerOpen(true)}
                >
                  {thumbnailBackgroundFile ? t('form.selectedFile', { file: thumbnailBackgroundFile }) : t('form.thumbnailBgSelect')}
                </Button>
              </div>
            </FormField>
          ) : null}

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
                  {t('form.showDisclaimer')}
                </label>
              )}
            />
          </FormField>

          <FormField
            label={t('form.disclaimerInVideo')}
            htmlFor='disclaimer-text'
            optional
            error={errors.disclaimerText?.message}
            className='min-w-0 sm:col-span-2 lg:col-span-3'
          >
            <Textarea
              id='disclaimer-text'
              rows={4}
              maxLength={2000}
              placeholder={t('form.disclaimerInVideoPlaceholder')}
              disabled={isSubmitting || !showDisclaimer}
              {...register('disclaimerText', {
                maxLength: {
                  value: 2000,
                  message: t('form.disclaimerInVideoMax'),
                },
              })}
            />
          </FormField>

          <FormField
            label={t('form.disclaimerInDesc')}
            htmlFor='description-disclaimer-text'
            optional
            error={errors.descriptionDisclaimerText?.message}
            className='min-w-0 sm:col-span-2 lg:col-span-3'
          >
            <Textarea
              id='description-disclaimer-text'
              rows={4}
              maxLength={2000}
              placeholder={t('form.disclaimerInDescPlaceholder')}
              disabled={isSubmitting || !showDisclaimer}
              {...register('descriptionDisclaimerText', {
                maxLength: {
                  value: 2000,
                  message: t('form.disclaimerInDescMax'),
                },
              })}
            />
          </FormField>

          <FormField label={t('form.uploadFrequency')} htmlFor='upload-frequency' error={errors.uploadFrequency?.message} className='min-w-0'>
            <Controller
              name='uploadFrequency'
              control={control}
              rules={{ required: t('form.uploadFrequencyRequired') }}
              render={({ field }) => (
                <Select
                  id='upload-frequency'
                  options={uploadFrequencyOptions}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder={t('form.uploadFrequencyPlaceholder')}
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
                  label={publishTimeSlotCount === 1 ? t('form.publishTime') : t('form.publishTimeN', { n: index + 1 })}
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
                      required: t('form.publishTimeRequired'),
                    })}
                  />
                </FormField>
              ))
            : null}

          {apiError ? <p className='text-xs text-danger sm:col-span-2 lg:col-span-3'>{apiError}</p> : null}
          {isEdit && !optionsLoading && formReady && !mailAccountId ? (
            <p className='text-xs text-danger sm:col-span-2 lg:col-span-3'>
              {/* replaced */}
            </p>
          ) : null}
        </form>
      </Modal>

      <ThumbnailBackgroundPickerModal
        open={backgroundPickerOpen}
        onClose={() => setBackgroundPickerOpen(false)}
        channelId={isEdit ? channel.id : undefined}
        tempSessionId={isEdit ? undefined : tempBackgroundSessionId}
        selectedFile={thumbnailBackgroundFile}
        onSelect={filename => {
          setValue('thumbnailBackgroundFile', filename);
        }}
      />
      <AudioBarPickerModal
        open={audioBarPickerOpen}
        onClose={() => setAudioBarPickerOpen(false)}
        selectedFile={audioBarFile}
        onSelect={filename => {
          setValue('audioBarFile', filename);
        }}
      />
      <SmallVideoPickerModal
        open={smallVideoPickerOpen}
        onClose={() => setSmallVideoPickerOpen(false)}
        selectedFile={smallVideoFile}
        onSelect={filename => {
          setValue('smallVideoFile', filename);
        }}
      />
      <SubscribePickerModal
        open={subscribePickerOpen}
        onClose={() => setSubscribePickerOpen(false)}
        selectedFile={subscribeFile}
        onSelect={filename => {
          setValue('subscribeFile', filename);
        }}
      />
    </>
  );
}
