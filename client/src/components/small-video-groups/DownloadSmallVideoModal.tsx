import { Controller, useForm } from 'react-hook-form';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadSmallVideoFromUrl } from '../../api/small-video-groups';
import { Button, Input, Modal, Select } from '../ui';
import type { DownloadSmallVideoFormValues, SmallVideoGroupListItem } from '../../types/smallVideoGroup';

interface DownloadSmallVideoModalProps {
  open: boolean;
  groups: SmallVideoGroupListItem[];
  /** Group preselected when the modal opens; '' = ungrouped. */
  defaultGroupId?: string;
  onClose: () => void;
  onSuccess: (fileName: string) => void;
}

export function DownloadSmallVideoModal({
  open,
  groups,
  defaultGroupId = '',
  onClose,
  onSuccess,
}: DownloadSmallVideoModalProps) {
  const { t } = useTranslation(['content', 'common']);
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DownloadSmallVideoFormValues>({
    defaultValues: { url: '', groupId: defaultGroupId },
  });

  const groupOptions = useMemo(
    () => [
      { value: '', label: t('assets.smallVideo.download.ungrouped') },
      ...groups.map((group) => ({ value: group.id, label: group.name })),
    ],
    [groups, t],
  );

  useEffect(() => {
    if (open) reset({ url: '', groupId: defaultGroupId });
  }, [open, defaultGroupId, reset]);

  function handleClose() {
    if (isSubmitting) return;
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: DownloadSmallVideoFormValues) {
    setApiError(null);
    try {
      const { item } = await downloadSmallVideoFromUrl({
        url: values.url.trim(),
        ...(values.groupId ? { groupId: values.groupId } : {}),
      });
      onSuccess(item.name);
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : t('assets.smallVideo.download.error'));
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('assets.smallVideo.download.title')}
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button size="sm" className="rounded-lg" disabled={isSubmitting} form="download-small-video-form" type="submit">
            {isSubmitting ? t('assets.smallVideo.download.downloading') : t('assets.smallVideo.download.submit')}
          </Button>
        </>
      }
    >
      <form id="download-small-video-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="small-video-download-url" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('assets.smallVideo.download.url')}
          </label>
          <Input
            id="small-video-download-url"
            placeholder={t('assets.smallVideo.download.urlPlaceholder')}
            className="h-10 rounded-lg font-mono text-sm"
            disabled={isSubmitting}
            {...register('url', {
              required: t('assets.smallVideo.download.urlRequired'),
              pattern: { value: /^https?:\/\/\S+$/i, message: t('assets.smallVideo.download.urlInvalid') },
            })}
          />
          {errors.url ? <p className="mt-1 text-xs text-danger">{errors.url.message}</p> : null}
        </div>

        <div>
          <label htmlFor="small-video-download-group" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('assets.smallVideo.download.group')}
          </label>
          <Controller
            name="groupId"
            control={control}
            render={({ field }) => (
              <Select
                id="small-video-download-group"
                options={groupOptions}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                searchable
                disabled={isSubmitting}
                className="w-full"
                triggerClassName="h-10 w-full min-w-0 rounded-lg px-3 py-0"
              />
            )}
          />
        </div>

        {isSubmitting ? <p className="text-xs text-neutral-500">{t('assets.smallVideo.download.hint')}</p> : null}
        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
