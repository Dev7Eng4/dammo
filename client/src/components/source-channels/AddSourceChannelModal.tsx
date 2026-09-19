import { Controller, useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchNiches } from '../../api/niches';
import { getSourcePurposeSelectOptions } from './PurposePill';
import { Button, Modal, Select } from '../ui';
import type { Niche } from '../../types/niche';
import type {
  AddSourceChannelFormValues,
  CreateSourceChannelPayload,
  SourceChannelLanguage,
} from '../../types/sourceChannel';
import { SOURCE_CHANNEL_LANGUAGE_LABELS } from '../../types/sourceChannel';

interface AddSourceChannelModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (payloads: CreateSourceChannelPayload[]) => void;
}

const languageOptions = (
  Object.entries(SOURCE_CHANNEL_LANGUAGE_LABELS) as [SourceChannelLanguage, string][]
).map(([value, label]) => ({ value, label }));

const defaultValues: AddSourceChannelFormValues = {
  url: '',
  purpose: 'reup',
  language: 'ja',
  niche: '',
};

export function AddSourceChannelModal({ open, onClose, onAdd }: AddSourceChannelModalProps) {
  const { t } = useTranslation(['source', 'common']);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [nichesError, setNichesError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<AddSourceChannelFormValues>({
    defaultValues,
  });

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();

    fetchNiches({ signal: controller.signal })
      .then((data) => {
        setNiches(data.items);
        setNichesError(null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setNichesError(err instanceof Error ? err.message : t('add.nichesLoadError'));
      });

    return () => controller.abort();
  }, [open, t]);

  const nichesLoading = open && niches.length === 0 && nichesError === null;
  const purposeOptions = getSourcePurposeSelectOptions(t);

  function handleClose() {
    setNiches([]);
    setNichesError(null);
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

    const niche = values.niche.trim();

    const payloads: CreateSourceChannelPayload[] = urls.map((url) => ({
      url,
      purpose: values.purpose as CreateSourceChannelPayload['purpose'],
      language: values.language,
      ...(niche ? { niche } : {}),
    }));

    reset(defaultValues);
    onAdd(payloads);
    onClose();
  }

  const nicheOptions = niches.map((item) => ({
    value: item.key,
    label: item.label,
  }));

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('add.title')}
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button size="sm" className="rounded-lg" form="add-source-form" type="submit">
            {t('add.submit')}
          </Button>
        </>
      }
    >
      <form id="add-source-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="source-url" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('add.urlsLabel')}
            <span className="ml-1 font-normal text-neutral-500">{t('add.urlsHint')}</span>
          </label>
          <textarea
            id="source-url"
            rows={5}
            placeholder={`https://youtube.com/@channel1\nhttps://youtube.com/@channel2\n@handle`}
            className="w-full resize-y rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-100 placeholder-neutral-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            {...register('url', { required: t('add.urlsRequired') })}
          />
          {errors.url ? <p className="mt-1 text-xs text-danger">{errors.url.message}</p> : null}
        </div>

        <div>
          <label htmlFor="source-purpose" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('add.purpose')}
          </label>
          <Controller
            name="purpose"
            control={control}
            rules={{ required: t('add.purposeRequired') }}
            render={({ field }) => (
              <Select
                id="source-purpose"
                options={purposeOptions}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={t('add.purposePlaceholder')}
                className="w-full"
                triggerClassName="h-10 w-full min-w-0 rounded-lg px-3 py-0"
              />
            )}
          />
          {errors.purpose ? <p className="mt-1 text-xs text-danger">{errors.purpose.message}</p> : null}
        </div>

        <div>
          <label htmlFor="source-language" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('add.language')}
          </label>
          <Controller
            name="language"
            control={control}
            rules={{ required: t('add.languageRequired') }}
            render={({ field }) => (
              <Select
                id="source-language"
                options={languageOptions}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={t('add.languagePlaceholder')}
                className="w-full"
                triggerClassName="h-10 w-full min-w-0 rounded-lg px-3 py-0"
              />
            )}
          />
          {errors.language ? <p className="mt-1 text-xs text-danger">{errors.language.message}</p> : null}
        </div>

        <div>
          <label htmlFor="source-niche" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Niche
            <span className="ml-1 font-normal text-neutral-500">{t('add.nicheOptional')}</span>
          </label>
          <Controller
            name="niche"
            control={control}
            render={({ field }) => (
              <Select
                id="source-niche"
                options={nicheOptions}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={
                  nichesLoading
                    ? t('add.nicheLoading')
                    : nicheOptions.length === 0
                      ? t('add.nicheEmpty')
                      : t('add.nichePlaceholder')
                }
                disabled={nichesLoading || nicheOptions.length === 0}
                className="w-full"
                triggerClassName="h-10 w-full min-w-0 rounded-lg px-3 py-0"
              />
            )}
          />
          {errors.niche ? <p className="mt-1 text-xs text-danger">{errors.niche.message}</p> : null}
          {nichesError ? <p className="mt-1 text-xs text-danger">{nichesError}</p> : null}
        </div>

        <p className="text-xs text-neutral-500">{t('add.hint')}</p>
      </form>
    </Modal>
  );
}
