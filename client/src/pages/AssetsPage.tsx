import { useMemo, useRef, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { assetFileUrl, deleteAssets, fetchAssets, prepareAssetColor, uploadAsset, type PrepareKeyColor } from '../api/assets';
import { CelebritiesPanel } from '../components/celebrities/CelebritiesPanel';
import { SmallVideoPanel } from '../components/small-video-groups/SmallVideoPanel';
import { Button, DataTable, Modal, useToast } from '../components/ui';
import { useAbortableEffect } from '../hooks';
import type { AssetFileItem, AssetKind } from '../types/asset';
import { cn } from '../lib/cn';

const TABS: { kind: AssetKind; label: string; accept: string }[] = [
  { kind: 'audioBar', label: 'Phổ âm thanh', accept: '.mp4,.mov,video/mp4,video/quicktime' },
  { kind: 'subscribe', label: 'Subscribe', accept: '.mp4,.mov,video/mp4,video/quicktime' },
  { kind: 'fonts', label: 'Phông chữ', accept: '.ttf,.otf,.woff,.woff2' },
  { kind: 'smallVideo', label: 'Video stock nhỏ', accept: '.mp4,.mov,video/mp4,video/quicktime' },
  {
    kind: 'siLocalStock',
    label: 'Video background footage',
    accept: '.mp4,.mov,video/mp4,video/quicktime',
  },
];

type AssetsPageTab = AssetKind | 'celebrities';

function isVideoKind(kind: AssetKind): boolean {
  return kind !== 'fonts';
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
}

function keyColorLabel(keyColor: PrepareKeyColor): string {
  return keyColor === 'black' ? 'màu đen' : 'màu xanh';
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
      <path d='M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z' />
      <circle cx='12' cy='12' r='3' />
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

function PaletteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
      <circle cx='12' cy='12' r='10' />
      <circle cx='8' cy='10' r='1.5' fill='currentColor' stroke='none' />
      <circle cx='12' cy='7' r='1.5' fill='currentColor' stroke='none' />
      <circle cx='16' cy='10' r='1.5' fill='currentColor' stroke='none' />
      <circle cx='9' cy='14' r='1.5' fill='currentColor' stroke='none' />
    </svg>
  );
}

export function AssetsPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTabId, setActiveTabId] = useState<AssetsPageTab>('audioBar');
  const [items, setItems] = useState<AssetFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [itemPendingDelete, setItemPendingDelete] = useState<string | null>(null);
  const [preparingItems, setPreparingItems] = useState<Set<string>>(() => new Set());
  const [prepareColorTarget, setPrepareColorTarget] = useState<string | null>(null);
  const [prepareKeyColor, setPrepareKeyColor] = useState<PrepareKeyColor>('green');

  const isCelebritiesTab = activeTabId === 'celebrities';
  const isSmallVideoTab = activeTabId === 'smallVideo';
  const activeKind: AssetKind = isCelebritiesTab ? 'audioBar' : activeTabId;
  const showPrepareColor = !isCelebritiesTab && !isSmallVideoTab && (activeKind === 'audioBar' || activeKind === 'subscribe');

  async function handlePrepareColor(name: string, keyColor: PrepareKeyColor) {
    setPrepareColorTarget(null);
    setPreparingItems(prev => new Set(prev).add(name));
    try {
      const result = await prepareAssetColor(activeKind, name, keyColor);
      const colorLabel = keyColorLabel(result.keyColor);
      toast.success(
        result.cached
          ? `${name} đã được xử lý ${colorLabel} trước đó`
          : `Đã xử lý ${colorLabel}: ${name}`,
      );
      setItems(prev => prev.map(it => (it.name === name ? { ...it, prepared: true } : it)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể xử lý màu');
    } finally {
      setPreparingItems(prev => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  }

  const activeTab = TABS.find(tab => tab.kind === activeKind) ?? TABS[0];
  const showVideoGrid = !isCelebritiesTab && !isSmallVideoTab && isVideoKind(activeKind);

  useAbortableEffect(
    async signal => {
      if (isCelebritiesTab || isSmallVideoTab) {
        setLoading(false);
        setItems([]);
        return;
      }
      setLoading(true);
      try {
        const data = await fetchAssets(activeKind, { signal });
        setItems(data.items);
        setSelectedIds(new Set());
      } catch {
        if (signal.aborted) return;
        setItems([]);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [activeKind, refreshKey, isCelebritiesTab, isSmallVideoTab],
  );

  const columns = useMemo<ColumnDef<AssetFileItem, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'TÊN FILE',
        cell: ({ getValue }) => <span className='font-medium text-neutral-100'>{getValue<string>()}</span>,
      },
      {
        accessorKey: 'size',
        header: 'KÍCH THƯỚC',
        cell: ({ getValue }) => (
          <span className='text-neutral-300'>{formatBytes(getValue<number>())}</span>
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: 'CẬP NHẬT',
        cell: ({ getValue }) => (
          <span className='text-neutral-300'>{formatUpdatedAt(getValue<string>())}</span>
        ),
      },
    ],
    [],
  );

  function handleToggleRow(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleToggleAll() {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(item => item.name)));
    }
  }

  async function handleUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;

    setUploading(true);
    try {
      await uploadAsset(activeKind, file);
      setRefreshKey(key => key + 1);
      toast.success(`Đã thêm ${file.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể tải lên file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleConfirmDelete() {
    if (showVideoGrid) {
      if (!itemPendingDelete) return;
      setDeleting(true);
      try {
        await deleteAssets(activeKind, [itemPendingDelete]);
        setShowDeleteConfirm(false);
        setItemPendingDelete(null);
        setRefreshKey(key => key + 1);
        toast.success('Đã xóa 1 file');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Không thể xóa file');
      } finally {
        setDeleting(false);
      }
      return;
    }

    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      const { deleted } = await deleteAssets(activeKind, Array.from(selectedIds));
      setShowDeleteConfirm(false);
      setSelectedIds(new Set());
      setRefreshKey(key => key + 1);
      toast.success(deleted.length === 1 ? 'Đã xóa 1 file' : `Đã xóa ${deleted.length} file`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể xóa file');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-xl font-semibold text-neutral-100'>Assets</h1>
        <p className='mt-1 text-sm text-neutral-400'>
          Quản lý file phổ âm thanh, phông chữ, video stock, background footage và người nổi tiếng.
        </p>
      </div>

      <div className='flex flex-wrap gap-2 border-b border-border pb-3'>
        {TABS.map(tab => (
          <button
            key={tab.kind}
            type='button'
            onClick={() => setActiveTabId(tab.kind)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm transition-colors',
              activeTabId === tab.kind
                ? 'bg-primary-500/15 text-primary-300'
                : 'text-neutral-400 hover:bg-surface-elevated hover:text-neutral-200',
            )}
          >
            {tab.label}
          </button>
        ))}
        <button
          type='button'
          onClick={() => setActiveTabId('celebrities')}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm transition-colors',
            isCelebritiesTab
              ? 'bg-primary-500/15 text-primary-300'
              : 'text-neutral-400 hover:bg-surface-elevated hover:text-neutral-200',
          )}
        >
          Người nổi tiếng
        </button>
      </div>

      {isCelebritiesTab ? (
        <CelebritiesPanel />
      ) : isSmallVideoTab ? (
        <SmallVideoPanel />
      ) : (
        <>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <span className='text-sm text-neutral-400'>
          {items.length.toLocaleString('vi-VN')} file · {activeTab.label}
        </span>
        <div className='flex items-center gap-2'>
          <input
            ref={fileInputRef}
            type='file'
            accept={activeTab.accept}
            className='hidden'
            onChange={e => {
              void handleUpload(e.target.files);
            }}
          />
          <Button
            variant='outlined'
            size='sm'
            className='rounded-lg'
            disabled={uploading || deleting}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? 'Đang tải lên…' : 'Thêm mới'}
          </Button>
          {!showVideoGrid ? (
            <Button
              variant='outlined'
              size='sm'
              className='rounded-lg'
              disabled={selectedIds.size === 0 || uploading || deleting}
              onClick={() => setShowDeleteConfirm(true)}
            >
              Xóa
            </Button>
          ) : null}
        </div>
      </div>

      {showVideoGrid ? (
        <div className='card-surface space-y-4 p-5'>
          {loading ? (
            <p className='py-10 text-center text-sm text-neutral-500'>Đang tải danh sách…</p>
          ) : items.length === 0 ? (
            <p className='py-10 text-center text-sm text-neutral-500'>Chưa có file nào trong mục này.</p>
          ) : (
            <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'>
              {items.map(item => {
                const src = assetFileUrl(activeKind, item.name);
                return (
                  <div key={item.name} className='group overflow-hidden rounded-xl border-2 border-neutral-800 transition hover:border-neutral-600'>
                    <div className='relative aspect-square w-full bg-neutral-950'>
                      <video
                        src={src}
                        muted
                        playsInline
                        preload='metadata'
                        className='pointer-events-none h-full w-full object-contain'
                        tabIndex={-1}
                      />
                      <div className='pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-black/55 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100'>
                        <button
                          type='button'
                          title='Xem'
                          className='rounded-full bg-neutral-900/90 p-2 text-neutral-100 hover:bg-neutral-800'
                          onClick={() => setPreviewUrl(src)}
                        >
                          <EyeIcon className='size-4' />
                        </button>
                        {showPrepareColor && !item.prepared && (
                          <button
                            type='button'
                            title='Xử lý màu'
                            className='rounded-full bg-emerald-600/90 p-2 text-white hover:bg-emerald-500 disabled:opacity-50'
                            disabled={preparingItems.has(item.name)}
                            onClick={() => {
                              setPrepareKeyColor('green');
                              setPrepareColorTarget(item.name);
                            }}
                          >
                            {preparingItems.has(item.name) ? (
                              <span className='block size-4 animate-spin rounded-full border-2 border-white border-t-transparent' />
                            ) : (
                              <PaletteIcon className='size-4' />
                            )}
                          </button>
                        )}
                        <button
                          type='button'
                          title='Xóa'
                          className='rounded-full bg-rose-600/90 p-2 text-white hover:bg-rose-500'
                          onClick={() => {
                            setItemPendingDelete(item.name);
                            setShowDeleteConfirm(true);
                          }}
                        >
                          <TrashIcon className='size-4' />
                        </button>
                      </div>
                    </div>
                    <div className='min-w-0 border-t border-neutral-800 bg-surface px-2 py-2'>
                      <p className='truncate text-[11px] font-medium text-neutral-200'>{item.name}</p>
                      <p className='text-[10px] text-neutral-500'>{formatBytes(item.size)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className='card-surface px-5 pt-3 pb-4'>
          <DataTable
            data={items}
            columns={columns}
            getRowId={item => item.name}
            loading={loading}
            emptyMessage='Chưa có file nào trong mục này.'
            enableRowSelection
            selectedIds={selectedIds}
            onToggleRow={handleToggleRow}
            onToggleAll={handleToggleAll}
          />
        </div>
      )}

      <Modal
        open={prepareColorTarget != null}
        onClose={() => setPrepareColorTarget(null)}
        title='Xử lý màu'
        footer={
          <>
            <Button
              variant='outlined'
              size='sm'
              className='rounded-lg'
              onClick={() => setPrepareColorTarget(null)}
            >
              Hủy
            </Button>
            <Button
              size='sm'
              className='rounded-lg'
              disabled={!prepareColorTarget}
              onClick={() => {
                if (!prepareColorTarget) return;
                void handlePrepareColor(prepareColorTarget, prepareKeyColor);
              }}
            >
              Xử lý
            </Button>
          </>
        }
      >
        <p className='mb-3 text-sm text-neutral-300'>
          Chọn màu nền cần loại bỏ cho <span className='font-medium text-neutral-100'>{prepareColorTarget}</span>
        </p>
        <div className='flex flex-col gap-2'>
          <label className='flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-700 px-3 py-2.5 hover:border-neutral-500 has-checked:border-emerald-500'>
            <input
              type='radio'
              name='prepare-key-color'
              checked={prepareKeyColor === 'green'}
              onChange={() => setPrepareKeyColor('green')}
              className='size-4 accent-emerald-500'
            />
            <span className='flex items-center gap-2 text-sm text-neutral-200'>
              <span className='size-3.5 rounded-sm bg-[#00FF00]' aria-hidden />
              Màu xanh
            </span>
          </label>
          <label className='flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-700 px-3 py-2.5 hover:border-neutral-500 has-checked:border-neutral-400'>
            <input
              type='radio'
              name='prepare-key-color'
              checked={prepareKeyColor === 'black'}
              onChange={() => setPrepareKeyColor('black')}
              className='size-4 accent-neutral-300'
            />
            <span className='flex items-center gap-2 text-sm text-neutral-200'>
              <span className='size-3.5 rounded-sm border border-neutral-600 bg-black' aria-hidden />
              Màu đen
            </span>
          </label>
        </div>
      </Modal>

      <Modal
        open={showDeleteConfirm}
        onClose={
          deleting
            ? () => undefined
            : () => {
                setShowDeleteConfirm(false);
                if (showVideoGrid) setItemPendingDelete(null);
              }
        }
        title='Xóa file?'
        footer={
          <>
            <Button
              variant='outlined'
              size='sm'
              className='rounded-lg'
              onClick={() => {
                setShowDeleteConfirm(false);
                if (showVideoGrid) setItemPendingDelete(null);
              }}
              disabled={deleting}
            >
              Hủy
            </Button>
            <Button size='sm' className='rounded-lg' disabled={deleting} onClick={() => void handleConfirmDelete()}>
              {deleting ? 'Đang xóa…' : 'Xóa'}
            </Button>
          </>
        }
      >
        <p className='text-sm text-neutral-300'>
          {showVideoGrid
            ? `Bạn có chắc muốn xóa file ${itemPendingDelete ?? ''} trong mục ${activeTab.label}?`
            : `Bạn có chắc muốn xóa ${selectedIds.size} file đã chọn trong mục ${activeTab.label}?`}
        </p>
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
      )}
    </div>
  );
}
