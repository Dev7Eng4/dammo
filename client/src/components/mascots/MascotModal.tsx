import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  createMascot,
  deleteMascotImage,
  mascotImageUrl,
  updateMascot,
  uploadMascotImage,
} from '../../api/mascots';
import type { MascotFormValues, MascotListItem } from '../../types/mascot';
import { Button, Input, Modal, Textarea } from '../ui';

const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';

interface MascotModalProps {
  open: boolean;
  /** When set the modal edits this mascot, otherwise it creates a new one. */
  mascot?: MascotListItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function MascotModal({ open, mascot, onClose, onSuccess }: MascotModalProps) {
  const { t } = useTranslation(['content', 'common']);
  const isEdit = Boolean(mascot);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MascotFormValues>({ defaultValues: { name: '', prompt: '' } });

  useEffect(() => {
    if (!open) return;
    reset({ name: mascot?.name ?? '', prompt: mascot?.prompt ?? '' });
    setPendingFile(null);
    setRemoveImage(false);
    setApiError(null);
  }, [open, mascot, reset]);

  const pendingPreviewUrl = useMemo(
    () => (pendingFile ? URL.createObjectURL(pendingFile) : null),
    [pendingFile],
  );
  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    };
  }, [pendingPreviewUrl]);

  const savedImageUrl =
    mascot?.hasImage && !removeImage ? mascotImageUrl(mascot.id, mascot.updatedAt) : null;
  const previewUrl = pendingPreviewUrl ?? savedImageUrl;

  function handleClose() {
    onClose();
  }

  async function onSubmit(values: MascotFormValues) {
    setApiError(null);
    try {
      const input = { name: values.name.trim(), prompt: values.prompt.trim() };
      const id = mascot
        ? (await updateMascot(mascot.id, input)).item.id
        : (await createMascot(input)).item.id;

      if (pendingFile) {
        await uploadMascotImage(id, pendingFile);
      } else if (mascot?.hasImage && removeImage) {
        await deleteMascotImage(id);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : t('assets.mascots.saveError'));
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEdit ? t('assets.mascots.editTitle') : t('assets.mascots.addTitle')}
      className='max-w-2xl'
      footer={
        <>
          <Button variant='outlined' size='sm' className='rounded-lg' onClick={handleClose} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button size='sm' className='rounded-lg' disabled={isSubmitting} form='mascot-form' type='submit'>
            {isSubmitting
              ? t('common:actions.saving')
              : isEdit
                ? t('assets.mascots.saveSubmit')
                : t('assets.mascots.addSubmit')}
          </Button>
        </>
      }
    >
      <form id='mascot-form' onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
        <div>
          <label htmlFor='mascot-name' className='mb-1.5 block text-xs font-medium text-neutral-400'>
            {t('assets.mascots.name')}
          </label>
          <Input
            id='mascot-name'
            placeholder={t('assets.mascots.namePlaceholder')}
            className='h-10 rounded-lg'
            {...register('name', { required: t('assets.mascots.nameRequired') })}
          />
          {errors.name ? <p className='mt-1 text-xs text-danger'>{errors.name.message}</p> : null}
        </div>

        <div>
          <label htmlFor='mascot-prompt' className='mb-1.5 block text-xs font-medium text-neutral-400'>
            {t('assets.mascots.prompt')}
          </label>
          <Textarea
            id='mascot-prompt'
            rows={8}
            placeholder={t('assets.mascots.promptPlaceholder')}
            className='text-sm'
            {...register('prompt', { required: t('assets.mascots.promptRequired') })}
          />
          {errors.prompt ? <p className='mt-1 text-xs text-danger'>{errors.prompt.message}</p> : null}
        </div>

        <div>
          <p className='mb-1.5 text-xs font-medium text-neutral-400'>{t('assets.mascots.image')}</p>
          <div className='flex items-start gap-4'>
            <div className='flex size-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-neutral-800 bg-neutral-950'>
              {previewUrl ? (
                <img src={previewUrl} alt='' className='h-full w-full object-contain' />
              ) : (
                <span className='px-2 text-center text-[11px] text-neutral-500'>
                  {t('assets.mascots.noImage')}
                </span>
              )}
            </div>
            <div className='space-y-2'>
              <input
                ref={fileInputRef}
                type='file'
                accept={IMAGE_ACCEPT}
                className='hidden'
                onChange={e => {
                  const file = e.target.files?.[0] ?? null;
                  if (file) {
                    setPendingFile(file);
                    setRemoveImage(false);
                  }
                  e.target.value = '';
                }}
              />
              <Button
                type='button'
                variant='outlined'
                size='sm'
                className='rounded-lg'
                disabled={isSubmitting}
                onClick={() => fileInputRef.current?.click()}
              >
                {previewUrl ? t('assets.mascots.replaceImage') : t('assets.mascots.uploadImage')}
              </Button>
              {previewUrl ? (
                <Button
                  type='button'
                  variant='outlined'
                  size='sm'
                  className='ml-2 rounded-lg'
                  disabled={isSubmitting}
                  onClick={() => {
                    setPendingFile(null);
                    setRemoveImage(true);
                  }}
                >
                  {t('assets.mascots.removeImage')}
                </Button>
              ) : null}
              <p className='text-[11px] text-neutral-500'>{t('assets.mascots.imageHint')}</p>
            </div>
          </div>
        </div>

        {apiError ? <p className='text-xs text-danger'>{apiError}</p> : null}
      </form>
    </Modal>
  );
}
