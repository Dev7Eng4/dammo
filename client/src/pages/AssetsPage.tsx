import { useMemo, useRef, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { assetFileUrl, deleteAssets, fetchAssets, uploadAsset } from '../api/assets';
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

export function AssetsPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeKind, setActiveKind] = useState<AssetKind>('audioBar');
  const [items, setItems] = useState<AssetFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const activeTab = TABS.find(tab => tab.kind === activeKind) ?? TABS[0];
  const showVideoGrid = isVideoKind(activeKind);

  useAbortableEffect(
    async signal => {
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
    [activeKind, refreshKey],
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
          Quản lý file phổ âm thanh, phông chữ, video stock nhỏ và background footage.
        </p>
      </div>

      <div className='flex flex-wrap gap-2 border-b border-border pb-3'>
        {TABS.map(tab => (
          <button
            key={tab.kind}
            type='button'
            onClick={() => setActiveKind(tab.kind)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm transition-colors',
              activeKind === tab.kind
                ? 'bg-primary-500/15 text-primary-300'
                : 'text-neutral-400 hover:bg-surface-elevated hover:text-neutral-200',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

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
          <Button
            variant='outlined'
            size='sm'
            className='rounded-lg'
            disabled={selectedIds.size === 0 || uploading || deleting}
            onClick={() => setShowDeleteConfirm(true)}
          >
            Xóa
          </Button>
        </div>
      </div>

      {showVideoGrid ? (
        <div className='card-surface space-y-4 p-5'>
          {items.length > 0 && !loading ? (
            <div className='flex items-center justify-between gap-2'>
              <span className='text-xs text-neutral-500'>
                {selectedIds.size > 0
                  ? `Đã chọn ${selectedIds.size}/${items.length}`
                  : 'Chọn video để xóa'}
              </span>
              <Button
                variant='outlined'
                size='sm'
                className='rounded-lg'
                disabled={loading || items.length === 0}
                onClick={handleToggleAll}
              >
                {selectedIds.size === items.length ? 'Bỏ chọn' : 'Chọn tất cả'}
              </Button>
            </div>
          ) : null}

          {loading ? (
            <p className='py-10 text-center text-sm text-neutral-500'>Đang tải danh sách…</p>
          ) : items.length === 0 ? (
            <p className='py-10 text-center text-sm text-neutral-500'>Chưa có file nào trong mục này.</p>
          ) : (
            <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'>
              {items.map(item => {
                const selected = selectedIds.has(item.name);
                const src = assetFileUrl(activeKind, item.name);
                return (
                  <div
                    key={item.name}
                    className={cn(
                      'group overflow-hidden rounded-xl border-2 transition',
                      selected
                        ? 'border-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]'
                        : 'border-neutral-800 hover:border-neutral-600',
                    )}
                  >
                    <button
                      type='button'
                      onClick={() => handleToggleRow(item.name)}
                      className='relative block aspect-square w-full cursor-pointer bg-neutral-950'
                      aria-pressed={selected}
                      aria-label={selected ? `Bỏ chọn ${item.name}` : `Chọn ${item.name}`}
                    >
                      <video
                        src={src}
                        muted
                        playsInline
                        preload='metadata'
                        className='pointer-events-none h-full w-full object-contain'
                        tabIndex={-1}
                      />
                      <span className='pointer-events-none absolute inset-0 bg-black/0 transition group-hover:bg-black/35' />
                      {selected ? (
                        <span className='absolute right-2 top-2 rounded-full bg-emerald-500 p-1 text-white shadow'>
                          <svg className='size-3' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <path d='M20 6 9 17l-5-5' />
                          </svg>
                        </span>
                      ) : null}
                    </button>
                    <div className='flex items-start gap-2 border-t border-neutral-800 bg-surface px-2 py-2'>
                      <input
                        type='checkbox'
                        checked={selected}
                        onChange={() => handleToggleRow(item.name)}
                        className='mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-600 bg-neutral-900'
                        aria-label={`Chọn ${item.name}`}
                      />
                      <div className='min-w-0 flex-1'>
                        <p className='truncate text-[11px] font-medium text-neutral-200'>{item.name}</p>
                        <p className='text-[10px] text-neutral-500'>{formatBytes(item.size)}</p>
                      </div>
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
        open={showDeleteConfirm}
        onClose={deleting ? () => undefined : () => setShowDeleteConfirm(false)}
        title='Xóa file?'
        footer={
          <>
            <Button
              variant='outlined'
              size='sm'
              className='rounded-lg'
              onClick={() => setShowDeleteConfirm(false)}
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
          Bạn có chắc muốn xóa {selectedIds.size} file đã chọn trong mục {activeTab.label}?
        </p>
      </Modal>
    </div>
  );
}
