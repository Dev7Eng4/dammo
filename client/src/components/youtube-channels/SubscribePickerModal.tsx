import { useEffect, useState } from 'react';
import { assetFileUrl, fetchAssets } from '../../api/assets';
import type { AssetFileItem } from '../../types/asset';
import { SI_OVERLAY_AUTO_SENTINEL } from '../../types/youtubeChannel';
import { Button, Modal } from '../ui';

interface SubscribePickerModalProps {
  open: boolean;
  onClose: () => void;
  selectedFile: string;
  onSelect: (filename: string) => void;
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
      <path d='M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z' />
      <circle cx='12' cy='12' r='3' />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
      <path d='M20 6 9 17l-5-5' />
    </svg>
  );
}

export function SubscribePickerModal({ open, onClose, selectedFile, onSelect }: SubscribePickerModalProps) {
  const [items, setItems] = useState<AssetFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const autoSelected = selectedFile === SI_OVERLAY_AUTO_SENTINEL;

  useEffect(() => {
    if (!open) {
      setPreviewUrl(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchAssets('subscribe')
      .then(({ items: next }) => {
        if (!cancelled) setItems(next);
      })
      .catch(err => {
        if (!cancelled) {
          setItems([]);
          setError(err instanceof Error ? err.message : 'Không thể tải danh sách subscribe');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  function handleToggleSelect(filename: string) {
    onSelect(selectedFile === filename ? '' : filename);
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title='Chọn subscribe'
        className='max-w-4xl'
        bodyClassName='min-h-[50vh] max-h-[75vh] overflow-y-auto'
        footer={
          <div className='flex flex-wrap items-center justify-end gap-2'>
            <Button
              variant='outlined'
              size='sm'
              className={`rounded-lg ${
                autoSelected
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                  : ''
              }`}
              onClick={() => handleToggleSelect(SI_OVERLAY_AUTO_SENTINEL)}
            >
              Tự động
            </Button>
            <Button variant='outlined' size='sm' className='rounded-lg' onClick={onClose}>
              Đóng
            </Button>
          </div>
        }
      >
        <div className='space-y-4'>
          {error ? (
            <p className='rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300'>
              {error}
            </p>
          ) : null}

          {loading ? (
            <p className='text-center text-xs text-neutral-500'>Đang tải danh sách video...</p>
          ) : items.length > 0 ? (
            <div className='grid grid-cols-3 gap-2 sm:grid-cols-4'>
              {items.map(item => {
                const selected = selectedFile === item.name;
                const src = assetFileUrl('subscribe', item.name);
                return (
                  <div
                    key={item.name}
                    className={`group relative aspect-square overflow-hidden rounded-lg border bg-neutral-950 transition ${
                      selected
                        ? 'border-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]'
                        : 'border-neutral-800 hover:border-neutral-600'
                    }`}
                  >
                    <video
                      src={src}
                      muted
                      playsInline
                      preload='metadata'
                      className='absolute inset-0 h-full w-full object-contain'
                    />
                    <div className='pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 bg-black/55 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100'>
                      <button
                        type='button'
                        title='Xem'
                        className='rounded-full bg-neutral-900/90 p-1.5 text-neutral-100 hover:bg-neutral-800'
                        onClick={() => setPreviewUrl(src)}
                      >
                        <EyeIcon className='size-3.5' />
                      </button>
                      <button
                        type='button'
                        title={selected ? 'Bỏ chọn' : 'Chọn'}
                        className={`rounded-full p-1.5 text-white ${
                          selected
                            ? 'bg-neutral-600/90 hover:bg-neutral-500'
                            : 'bg-emerald-600/90 hover:bg-emerald-500'
                        }`}
                        onClick={() => handleToggleSelect(item.name)}
                      >
                        <CheckIcon className='size-3.5' />
                      </button>
                    </div>
                    {selected ? (
                      <span className='absolute right-1.5 top-1.5 rounded-full bg-emerald-500 p-0.5 text-white shadow'>
                        <CheckIcon className='size-2.5' />
                      </span>
                    ) : null}
                    <p className='absolute inset-x-0 bottom-0 truncate bg-black/70 px-1.5 py-0.5 text-[10px] text-neutral-300'>
                      {item.name}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className='text-center text-xs text-neutral-500'>Chưa có video subscribe trong assets</p>
          )}
        </div>
      </Modal>

      {previewUrl ? (
        <div className='fixed inset-0 z-60 flex items-center justify-center p-4'>
          <button
            type='button'
            aria-label='Đóng xem video'
            className='absolute inset-0 bg-black/80'
            onClick={() => setPreviewUrl(null)}
          />
          <div className='relative z-10 max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-surface shadow-xl'>
            <video
              src={previewUrl}
              controls
              autoPlay
              playsInline
              className='max-h-[85vh] w-full bg-black object-contain'
            />
            <button
              type='button'
              className='absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs text-neutral-100 hover:bg-black'
              onClick={() => setPreviewUrl(null)}
            >
              Đóng
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
