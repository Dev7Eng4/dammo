import { useMemo, useRef, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { deleteAssets, fetchAssets, uploadAsset } from '../api/assets';
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
