import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageOff } from 'lucide-react';
import {
  deleteYoutubeChannelMascotImage,
  deleteYoutubeChannelMascotImageTemp,
  uploadYoutubeChannelMascotImage,
  uploadYoutubeChannelMascotImageTemp,
  type ChannelMascotImageKind,
} from '../../api/youtubeChannels';
import { Button, useToast } from '../ui';

interface ChannelMascotImageFieldProps {
  kind: ChannelMascotImageKind;
  label: string;
  hint: string;
  optional?: boolean;
  /** Set when editing: uploads go straight to the channel. Otherwise into the temp session. */
  channelId?: string;
  tempSessionId: string;
  imageUrl: string | null;
  onImageUrlChange: (url: string | null) => void;
  disabled?: boolean;
}

/** Upload / preview / remove one channel mascot image (the mascot itself or its character sheet). */
export function ChannelMascotImageField({
  kind,
  label,
  hint,
  optional = false,
  channelId,
  tempSessionId,
  imageUrl,
  onImageUrlChange,
  disabled = false,
}: ChannelMascotImageFieldProps) {
  const { t } = useTranslation('youtube');
  const { t: tCommon } = useTranslation('common');
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const inputId = `channel-${kind}-upload`;

  async function handleUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { item } = channelId
        ? await uploadYoutubeChannelMascotImage(kind, channelId, file)
        : await uploadYoutubeChannelMascotImageTemp(kind, tempSessionId, file);
      // Same file name on every upload, so bust the browser cache.
      onImageUrlChange(`${item.url}?v=${Date.now()}`);
      toast.success(t('form.mascotUploadSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('form.mascotUploadError'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      if (channelId) {
        await deleteYoutubeChannelMascotImage(kind, channelId);
      } else {
        await deleteYoutubeChannelMascotImageTemp(kind, tempSessionId);
      }
      onImageUrlChange(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('form.mascotRemoveError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='min-w-0'>
      <label htmlFor={inputId} className='mb-1.5 block text-xs font-medium text-neutral-400'>
        {label}
        {optional ? <span className='text-neutral-500'> {tCommon('actions.optional')}</span> : null}
      </label>
      <div className='flex items-center gap-3'>
        <div className='flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900'>
          {imageUrl ? (
            <img src={imageUrl} alt={label} className='size-full object-contain' />
          ) : (
            <ImageOff className='size-5 text-neutral-500' aria-hidden='true' />
          )}
        </div>
        <div className='min-w-0 space-y-1.5'>
          <div className='flex items-center gap-2'>
            <input
              id={inputId}
              ref={inputRef}
              type='file'
              accept='image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'
              className='hidden'
              onChange={e => {
                void handleUpload(e.target.files);
              }}
            />
            <Button
              type='button'
              variant='outlined'
              size='sm'
              className='h-8 rounded-md px-2 text-xs'
              disabled={disabled || busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? t('form.uploadingImage') : t('form.uploadImage')}
            </Button>
            {imageUrl ? (
              <Button
                type='button'
                variant='outlined'
                size='sm'
                className='h-8 rounded-md px-2 text-xs'
                disabled={disabled || busy}
                onClick={() => {
                  void handleRemove();
                }}
              >
                {t('form.removeImage')}
              </Button>
            ) : null}
          </div>
          <p className='text-[11px] leading-snug text-neutral-500'>{hint}</p>
        </div>
      </div>
    </div>
  );
}
