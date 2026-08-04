import { useRef } from 'react';
import { Button, DropdownSelect } from '../ui';
import type { ProxyFilter } from '../../types/proxy';

interface ProxiesToolbarProps {
  total: number;
  filter: ProxyFilter;
  onFilterChange: (filter: ProxyFilter) => void;
  onAddProxy: () => void;
  onImportExcel: (file: File) => void;
  onExportExcel: () => void;
  onDeleteSelected: () => void;
  onRemoveFailed: () => void;
  canDeleteSelected?: boolean;
  deletingSelected?: boolean;
  exporting?: boolean;
  importing?: boolean;
  removingFailed?: boolean;
}

const filterOptions: { value: ProxyFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'active', label: 'Hoạt động' },
  { value: 'failed', label: 'Thất bại' },
  { value: 'slow', label: 'Chậm' },
  { value: 'expired', label: 'Hết hạn' },
  { value: 'in_use', label: 'Đang dùng' },
];

const filterIcon = (
  <svg className='size-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
    <path d='M22 3H2l8 9.46V19l4 2v-8.54L22 3z' />
  </svg>
);

export function ProxiesToolbar({
  total,
  filter,
  onFilterChange,
  onAddProxy,
  onImportExcel,
  onExportExcel,
  onDeleteSelected,
  onRemoveFailed,
  canDeleteSelected = false,
  deletingSelected = false,
  exporting = false,
  importing = false,
  removingFailed = false,
}: ProxiesToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      onImportExcel(file);
      event.target.value = '';
    }
  }

  return (
    <div className='mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4'>
      <div className='flex items-center gap-3'>
        <DropdownSelect
          options={filterOptions}
          value={filter}
          onChange={onFilterChange}
          prefix='Lọc'
          leadingIcon={filterIcon}
          menuClassName='w-40'
        />
        {/* <span className="text-sm text-neutral-400">{total.toLocaleString()} Proxies Total</span> */}
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <input ref={fileInputRef} type='file' accept='.xlsx,.xls' className='hidden' onChange={handleFileChange} />
        <Button size='sm' className='rounded-lg' onClick={onAddProxy}>
          + Thêm Proxy
        </Button>
        <Button variant='outlined' size='sm' className='rounded-lg' disabled={importing} onClick={() => fileInputRef.current?.click()}>
          {importing ? 'Đang nhập...' : 'Nhập Excel'}
        </Button>
        <Button variant='outlined' size='sm' className='rounded-lg' disabled={exporting} onClick={onExportExcel}>
          {exporting ? 'Đang xuất...' : 'Xuất Excel'}
        </Button>
        <Button
          variant='outlined'
          size='sm'
          className='rounded-lg text-danger hover:text-danger'
          disabled={!canDeleteSelected || deletingSelected}
          onClick={onDeleteSelected}
        >
          {deletingSelected ? 'Đang xóa...' : 'Xóa'}
        </Button>
        <Button
          variant='outlined'
          size='sm'
          className='rounded-lg text-danger hover:text-danger'
          disabled={removingFailed}
          onClick={onRemoveFailed}
        >
          {removingFailed ? 'Đang xóa...' : 'Xóa thất bại'}
        </Button>
      </div>
    </div>
  );
}
