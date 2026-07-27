import { useEffect, useId, useRef, useState } from 'react';
import {
  deleteThumbnailBackground,
  listThumbnailBackgrounds,
  thumbnailBackgroundFileUrl,
  uploadThumbnailBackground,
  type ThumbnailBackgroundScope,
} from '../../api/youtubeChannels';
import type { ThumbnailBackgroundItem } from '../../types/youtubeChannel';
import { Button, Image, Modal } from '../ui';

const ACCEPT = 'image/jpeg,image/png,image/webp';

interface ThumbnailBackgroundPickerModalProps {
  open: boolean;
  onClose: () => void;
  channelId?: string;
  tempSessionId?: string;
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

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
      <path d='M3 6h18' />
      <path d='M8 6V4h8v2' />
      <path d='M19 6l-1 14H6L5 6' />
      <path d='M10 11v6' />
      <path d='M14 11v6' />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5'>
      <path d='M12 16V4' />
      <path d='m7 9 5-5 5 5' />
      <path d='M4 20h16' />
    </svg>
  );
}

function resolveScope(channelId?: string, tempSessionId?: string): ThumbnailBackgroundScope | null {
  if (channelId) return { channelId };
  if (tempSessionId) return { tempSessionId };
  return null;
}

export function ThumbnailBackgroundPickerModal({
  open,
  onClose,
  channelId,
  tempSessionId,
  selectedFile,
  onSelect,
}: ThumbnailBackgroundPickerModalProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ThumbnailBackgroundItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const scope = resolveScope(channelId, tempSessionId);

  useEffect(() => {
    if (!open || !scope) {
      setPreviewUrl(null);
      setError(null);
      setDeletingName(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void listThumbnailBackgrounds(scope)
      .then(({ items: next }) => {
        if (!cancelled) setItems(next);
      })
      .catch(err => {
        if (!cancelled) {
          setItems([]);
          setError(err instanceof Error ? err.message : 'Không thể tải danh sách ảnh nền');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, channelId, tempSessionId]);

  async function handleUpload(file: File | undefined) {
    if (!file || !scope) return;
    setUploading(true);
    setError(null);
    try {
      const { item } = await uploadThumbnailBackground(scope, file);
      setItems(prev => {
        const without = prev.filter(entry => entry.name !== item.name);
        return [...without, item].sort((a, b) => a.name.localeCompare(b.name));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải ảnh lên');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDelete(filename: string) {
    if (!scope || deletingName) return;
    setDeletingName(filename);
    setError(null);
    try {
      await deleteThumbnailBackground(scope, filename);
      setItems(prev => prev.filter(entry => entry.name !== filename));
      if (selectedFile === filename) {
        onSelect('');
      }
      setPreviewUrl(prev =>
        prev?.includes(encodeURIComponent(filename)) || prev?.endsWith(`/${filename}`) ? null : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa ảnh');
    } finally {
      setDeletingName(null);
    }
  }

  function resolveUrl(item: ThumbnailBackgroundItem): string {
    if (!scope) return item.url;
    if (item.url.startsWith('http') || item.url.startsWith('/')) return item.url;
    return thumbnailBackgroundFileUrl(scope, item.name);
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title='Chọn ảnh nền thumbnail'
        className='max-w-2xl'
        bodyClassName='max-h-[60vh] overflow-y-auto'
        footer={
          <Button variant='outlined' size='sm' className='rounded-lg' onClick={onClose}>
            Đóng
          </Button>
        }
      >
        <div className='space-y-4'>
          {error ? (
            <p className='rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300'>
              {error}
            </p>
          ) : null}

          <label
            htmlFor={inputId}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-700 bg-surface-elevated px-4 py-8 text-center transition hover:border-neutral-500 hover:bg-neutral-900/40 ${
              uploading || !scope ? 'pointer-events-none opacity-60' : ''
            }`}
          >
            <UploadIcon className='size-8 text-neutral-400' />
            <span className='text-sm font-medium text-neutral-200'>
              {uploading ? 'Đang tải ảnh...' : 'Tải ảnh'}
            </span>
            <span className='text-[11px] text-neutral-500'>JPEG, PNG hoặc WebP · tối đa 10 MB</span>
            <input
              id={inputId}
              ref={fileInputRef}
              type='file'
              accept={ACCEPT}
              className='sr-only'
              disabled={uploading || !scope}
              onChange={event => {
                void handleUpload(event.target.files?.[0]);
              }}
            />
          </label>

          {loading ? (
            <p className='text-center text-xs text-neutral-500'>Đang tải danh sách ảnh...</p>
          ) : items.length === 0 ? (
            <p className='text-center text-xs text-neutral-500'>Chưa có ảnh nền nào</p>
          ) : (
            <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
              {items.map(item => {
                const selected = selectedFile === item.name;
                const src = resolveUrl(item);
                const deleting = deletingName === item.name;
                return (
                  <div
                    key={item.name}
                    className={`group relative overflow-hidden rounded-xl border-2 transition ${
                      selected
                        ? 'border-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]'
                        : 'border-neutral-800 hover:border-neutral-600'
                    } ${deleting ? 'opacity-50' : ''}`}
                  >
                    <Image
                      src={src}
                      alt={item.name}
                      aspectRatio='square'
                      rounded='none'
                      className='h-full w-full'
                    />
                    <div className='pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-black/55 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100'>
                      <button
                        type='button'
                        title='Xem'
                        className='rounded-full bg-neutral-900/90 p-2 text-neutral-100 hover:bg-neutral-800'
                        disabled={deleting}
                        onClick={() => setPreviewUrl(src)}
                      >
                        <EyeIcon className='size-4' />
                      </button>
                      <button
                        type='button'
                        title='Chọn'
                        className='rounded-full bg-emerald-600/90 p-2 text-white hover:bg-emerald-500'
                        disabled={deleting}
                        onClick={() => onSelect(item.name)}
                      >
                        <CheckIcon className='size-4' />
                      </button>
                      {!selected ? (
                        <button
                          type='button'
                          title='Xóa'
                          className='rounded-full bg-red-600/90 p-2 text-white hover:bg-red-500'
                          disabled={deleting}
                          onClick={() => {
                            void handleDelete(item.name);
                          }}
                        >
                          <TrashIcon className='size-4' />
                        </button>
                      ) : null}
                    </div>
                    {selected ? (
                      <span className='absolute right-2 top-2 rounded-full bg-emerald-500 p-1 text-white shadow'>
                        <CheckIcon className='size-3' />
                      </span>
                    ) : null}
                    <p className='truncate border-t border-neutral-800 bg-surface px-2 py-1 text-[10px] text-neutral-400'>
                      {item.name}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      {previewUrl ? (
        <div className='fixed inset-0 z-60 flex items-center justify-center p-4'>
          <button
            type='button'
            aria-label='Đóng xem ảnh'
            className='absolute inset-0 bg-black/80'
            onClick={() => setPreviewUrl(null)}
          />
          <div className='relative z-10 max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl border border-border bg-surface shadow-xl'>
            <img src={previewUrl} alt='Xem ảnh nền' className='max-h-[85vh] max-w-full object-contain' />
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
