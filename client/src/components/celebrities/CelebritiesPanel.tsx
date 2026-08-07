import { useRef, useState } from 'react';
import {
  celebrityMediaUrl,
  deleteCelebrity,
  deleteCelebrityMedia,
  fetchCelebrities,
  fetchCelebrityMedia,
  uploadCelebrityMedia,
} from '../../api/celebrities';
import { Button, Modal, useToast } from '../ui';
import { useAbortableEffect } from '../../hooks';
import type { CelebrityListItem, CelebrityMediaItem } from '../../types/celebrity';
import { AddCelebrityModal } from './AddCelebrityModal';

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

const MEDIA_ACCEPT = '.jpg,.jpeg,.png,.webp,.mp4,.mov,image/jpeg,image/png,image/webp,video/mp4,video/quicktime';

export function CelebritiesPanel() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<CelebrityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selected, setSelected] = useState<CelebrityListItem | null>(null);
  const [media, setMedia] = useState<CelebrityMediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaRefreshKey, setMediaRefreshKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [celebrityPendingDelete, setCelebrityPendingDelete] = useState<CelebrityListItem | null>(null);
  const [mediaPendingDelete, setMediaPendingDelete] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; kind: 'image' | 'video' } | null>(null);

  useAbortableEffect(
    async (signal) => {
      setLoading(true);
      try {
        const data = await fetchCelebrities({ signal });
        setItems(data.items);
      } catch {
        if (signal.aborted) return;
        setItems([]);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [refreshKey],
  );

  useAbortableEffect(
    async (signal) => {
      setMediaLoading(true);
      try {
        const data = await fetchCelebrityMedia(selected!.id, { signal });
        setMedia(data.items);
      } catch {
        if (signal.aborted) return;
        setMedia([]);
      } finally {
        if (!signal.aborted) setMediaLoading(false);
      }
    },
    [selected?.id, mediaRefreshKey],
    { enabled: Boolean(selected) },
  );

  function refreshList() {
    setRefreshKey((key) => key + 1);
  }

  function refreshMedia() {
    setMediaRefreshKey((key) => key + 1);
  }

  async function handleUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file || !selected) return;

    setUploading(true);
    try {
      await uploadCelebrityMedia(selected.id, file);
      refreshMedia();
      refreshList();
      toast.success(`Đã thêm ${file.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể tải lên file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleConfirmDeleteCelebrity() {
    if (!celebrityPendingDelete) return;
    setDeleting(true);
    try {
      await deleteCelebrity(celebrityPendingDelete.id);
      if (selected?.id === celebrityPendingDelete.id) setSelected(null);
      setCelebrityPendingDelete(null);
      refreshList();
      toast.success('Đã xóa người nổi tiếng');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể xóa');
    } finally {
      setDeleting(false);
    }
  }

  async function handleConfirmDeleteMedia() {
    if (!selected || !mediaPendingDelete) return;
    setDeleting(true);
    try {
      await deleteCelebrityMedia(selected.id, [mediaPendingDelete]);
      setMediaPendingDelete(null);
      refreshMedia();
      refreshList();
      toast.success('Đã xóa 1 file');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể xóa file');
    } finally {
      setDeleting(false);
    }
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="mb-1 text-xs font-medium text-primary-400 hover:text-primary-300"
            >
              ← Quay lại danh sách
            </button>
            <h2 className="truncate text-base font-semibold text-neutral-100">{selected.name}</h2>
            {selected.note ? <p className="mt-0.5 text-xs text-neutral-500">{selected.note}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={MEDIA_ACCEPT}
              className="hidden"
              onChange={(e) => {
                void handleUpload(e.target.files);
              }}
            />
            <Button
              variant="outlined"
              size="sm"
              className="rounded-lg"
              disabled={uploading || deleting}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? 'Đang tải lên…' : 'Thêm ảnh / video'}
            </Button>
          </div>
        </div>

        <div className="card-surface space-y-4 p-5">
          {mediaLoading ? (
            <p className="py-10 text-center text-sm text-neutral-500">Đang tải media…</p>
          ) : media.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-500">
              Chưa có ảnh hoặc video. Bấm &quot;Thêm ảnh / video&quot; để tải lên.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {media.map((item) => {
                const src = celebrityMediaUrl(selected.id, item.name);
                return (
                  <div
                    key={item.name}
                    className="group overflow-hidden rounded-xl border-2 border-neutral-800 transition hover:border-neutral-600"
                  >
                    <div className="relative aspect-square w-full bg-neutral-950">
                      {item.kind === 'image' ? (
                        <img src={src} alt={item.name} className="h-full w-full object-contain" />
                      ) : (
                        <video
                          src={src}
                          muted
                          playsInline
                          preload="metadata"
                          className="pointer-events-none h-full w-full object-contain"
                          tabIndex={-1}
                        />
                      )}
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-black/55 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100">
                        <button
                          type="button"
                          title="Xem"
                          className="rounded-full bg-neutral-900/90 p-2 text-neutral-100 hover:bg-neutral-800"
                          onClick={() => setPreview({ url: src, kind: item.kind })}
                        >
                          <EyeIcon className="size-4" />
                        </button>
                        <button
                          type="button"
                          title="Xóa"
                          className="rounded-full bg-rose-600/90 p-2 text-white hover:bg-rose-500"
                          onClick={() => setMediaPendingDelete(item.name)}
                        >
                          <TrashIcon className="size-4" />
                        </button>
                      </div>
                    </div>
                    <div className="min-w-0 border-t border-neutral-800 bg-surface px-2 py-2">
                      <p className="truncate text-[11px] font-medium text-neutral-200">{item.name}</p>
                      <p className="text-[10px] text-neutral-500">
                        {item.kind === 'image' ? 'Ảnh' : 'Video'} · {formatBytes(item.size)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Modal
          open={Boolean(mediaPendingDelete)}
          onClose={deleting ? () => undefined : () => setMediaPendingDelete(null)}
          title="Xóa file?"
          footer={
            <>
              <Button
                variant="outlined"
                size="sm"
                className="rounded-lg"
                onClick={() => setMediaPendingDelete(null)}
                disabled={deleting}
              >
                Hủy
              </Button>
              <Button size="sm" className="rounded-lg" disabled={deleting} onClick={() => void handleConfirmDeleteMedia()}>
                {deleting ? 'Đang xóa…' : 'Xóa'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-neutral-300">
            Bạn có chắc muốn xóa file {mediaPendingDelete ?? ''}?
          </p>
        </Modal>

        {preview ? (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
            <button
              type="button"
              aria-label="Đóng xem media"
              className="absolute inset-0 bg-black/80"
              onClick={() => setPreview(null)}
            />
            <div className="relative z-10 max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
              {preview.kind === 'image' ? (
                <img src={preview.url} alt="" className="max-h-[85vh] w-full bg-black object-contain" />
              ) : (
                <video
                  src={preview.url}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[85vh] w-full bg-black object-contain"
                />
              )}
              <button
                type="button"
                className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs text-neutral-100 hover:bg-black"
                onClick={() => setPreview(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-neutral-400">
          {items.length.toLocaleString('vi-VN')} người nổi tiếng
        </span>
        <Button size="sm" className="rounded-lg" onClick={() => setShowAddModal(true)}>
          + Thêm người nổi tiếng
        </Button>
      </div>

      <div className="card-surface p-5">
        {loading ? (
          <p className="py-10 text-center text-sm text-neutral-500">Đang tải danh sách…</p>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-500">
            Chưa có người nổi tiếng. Bấm &quot;Thêm người nổi tiếng&quot; để bắt đầu.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface-elevated/40 px-4 py-3 transition hover:border-neutral-600"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setSelected(item)}
                >
                  <p className="truncate text-sm font-medium text-neutral-100">{item.name}</p>
                  {item.note ? (
                    <p className="mt-0.5 truncate text-xs text-neutral-500">{item.note}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-neutral-500">
                    {item.mediaCount} file media
                  </p>
                </button>
                <button
                  type="button"
                  title="Xóa"
                  className="shrink-0 rounded-md p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-rose-400"
                  onClick={() => setCelebrityPendingDelete(item)}
                >
                  <TrashIcon className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddCelebrityModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          refreshList();
          toast.success('Đã thêm người nổi tiếng');
        }}
      />

      <Modal
        open={Boolean(celebrityPendingDelete)}
        onClose={deleting ? () => undefined : () => setCelebrityPendingDelete(null)}
        title="Xóa người nổi tiếng?"
        footer={
          <>
            <Button
              variant="outlined"
              size="sm"
              className="rounded-lg"
              onClick={() => setCelebrityPendingDelete(null)}
              disabled={deleting}
            >
              Hủy
            </Button>
            <Button
              size="sm"
              className="rounded-lg"
              disabled={deleting}
              onClick={() => void handleConfirmDeleteCelebrity()}
            >
              {deleting ? 'Đang xóa…' : 'Xóa'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-300">
          Bạn có chắc muốn xóa {celebrityPendingDelete?.name ?? ''} và toàn bộ ảnh/video đi kèm?
        </p>
      </Modal>
    </div>
  );
}
