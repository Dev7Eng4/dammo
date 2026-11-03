import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageOff } from 'lucide-react';
import { assetFileUrl, fetchAssets } from '../../api/assets';
import {
  deleteYoutubeChannelMascotImage,
  deleteYoutubeChannelMascotImageTemp,
  pickYoutubeChannelMascotImageFromLibrary,
  uploadYoutubeChannelMascotImage,
  uploadYoutubeChannelMascotImageTemp,
  type ChannelMascotImageKind,
} from '../../api/youtubeChannels';
import type { AssetFileItem } from '../../types/asset';
import { Button, Modal, useToast } from '../ui';

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

/** Every upload keeps the same file name, so bust the browser cache. */
function cacheBustedUrl(url: string): string {
  return `${url}?v=${Date.now()}`;
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
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryItems, setLibraryItems] = useState<AssetFileItem[] | null>(null);

  async function openLibrary() {
    setLibraryOpen(true);
    setLibraryItems(null);
    try {
      const { items } = await fetchAssets('mascot');
      setLibraryItems(items);
    } catch (err) {
      setLibraryItems([]);
      toast.error(err instanceof Error ? err.message : t('form.mascotLibraryError'));
    }
  }

  async function handlePickFromLibrary(name: string) {
    setLibraryOpen(false);
    setBusy(true);
    try {
      const { item } = await pickYoutubeChannelMascotImageFromLibrary(
        kind,
        channelId ? { channelId } : { sessionId: tempSessionId },
        name,
      );
      onImageUrlChange(cacheBustedUrl(item.url));
      toast.success(t('form.mascotUploadSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('form.mascotUploadError'));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { item } = channelId
        ? await uploadYoutubeChannelMascotImage(kind, channelId, file)
        : await uploadYoutubeChannelMascotImageTemp(kind, tempSessionId, file);
      onImageUrlChange(cacheBustedUrl(item.url));
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
            <Button
              type='button'
              variant='outlined'
              size='sm'
              className='h-8 rounded-md px-2 text-xs'
              disabled={disabled || busy}
              onClick={() => {
                void openLibrary();
              }}
            >
              {t('form.mascotPickFromLibrary')}
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
      <Modal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        title={t('form.mascotLibraryTitle', { label })}
        className='max-w-2xl'
      >
        {libraryItems === null ? (
          <p className='py-8 text-center text-sm text-neutral-500'>{tCommon('actions.loading')}</p>
        ) : libraryItems.length === 0 ? (
          <p className='py-8 text-center text-sm text-neutral-500'>{t('form.mascotLibraryEmpty')}</p>
        ) : (
          <div className='grid max-h-[60vh] grid-cols-3 gap-2 overflow-auto sm:grid-cols-4'>
            {libraryItems.map(item => (
              <button
                key={item.name}
                type='button'
                title={item.name}
                className='overflow-hidden rounded-xl border-2 border-neutral-800 text-left transition hover:border-emerald-500'
                onClick={() => {
                  void handlePickFromLibrary(item.name);
                }}
              >
                <div className='aspect-square w-full bg-neutral-950'>
                  <img
                    src={assetFileUrl('mascot', item.name)}
                    alt={item.name}
                    loading='lazy'
                    className='size-full object-contain'
                  />
                </div>
                <p className='truncate border-t border-neutral-800 px-2 py-1.5 text-[11px] text-neutral-300'>{item.name}</p>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
