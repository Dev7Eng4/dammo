import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
} from '@tanstack/react-table';
import { cn } from '../../lib/cn';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    headerClassName?: string;
    cellClassName?: string;
  }
}

export type DataTableProps<TData> = {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  getRowId: (row: TData) => string;
  loading?: boolean;
  emptyMessage?: string;
  emptyDescription?: string;
  selectedIds?: Set<string>;
  onToggleRow?: (id: string) => void;
  onToggleAll?: () => void;
  enableRowSelection?: boolean;
  activeRowId?: string | null;
  onRowClick?: (row: TData) => void;
  error?: string | null;
  showRowNumbers?: boolean;
  rowNumberStart?: number;
};

const checkboxClassName = 'size-3.5 rounded border-border bg-surface accent-primary-500';

function SelectionHeader({
  allSelected,
  onToggleAll,
}: {
  allSelected: boolean;
  onToggleAll?: () => void;
}) {
  return (
    <th className="min-w-[50px] w-8 pb-3 pr-4">
      <input
        type="checkbox"
        checked={allSelected}
        onChange={onToggleAll}
        className={checkboxClassName}
        aria-label="Select all rows"
      />
    </th>
  );
}

function SelectionCell({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle?: () => void;
}) {
  return (
    <td className="min-w-[50px] py-3 pr-4" onClick={e => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className={checkboxClassName}
        aria-label="Select row"
      />
    </td>
  );
}

function RowNumberHeader() {
  return <th className="min-w-[50px] w-10 pb-3 pr-4 font-medium">STT</th>;
}

function RowNumberCell({ value }: { value: number }) {
  return <td className="min-w-[50px] py-3 pr-4 tabular-nums text-neutral-500">{value}</td>;
}

export function DataTable<TData>({
  data,
  columns,
  getRowId,
  loading,
  emptyMessage = 'No items found.',
  emptyDescription,
  selectedIds,
  onToggleRow,
  onToggleAll,
  enableRowSelection = false,
  activeRowId,
  onRowClick,
  error,
  showRowNumbers = false,
  rowNumberStart = 1,
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: row => getRowId(row),
  });

  const colCount =
    columns.length + (enableRowSelection ? 1 : 0) + (showRowNumbers ? 1 : 0);
  const allSelected = data.length > 0 && !!selectedIds && selectedIds.size === data.length;

  const headerRow = (
    <tr className="border-b border-border text-xs text-neutral-500">
      {enableRowSelection && <SelectionHeader allSelected={allSelected} onToggleAll={onToggleAll} />}
      {showRowNumbers && <RowNumberHeader />}
      {table.getHeaderGroups().map(headerGroup =>
        headerGroup.headers.map(header => (
          <th
            key={header.id}
            className={cn(
              'min-w-[50px] pb-3 font-medium',
              header.column.getIndex() < columns.length - 1 ? 'pr-4' : undefined,
              header.column.columnDef.meta?.headerClassName,
            )}
          >
            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
          </th>
        )),
      )}
    </tr>
  );

  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-neutral-500">
              {enableRowSelection && <th className="min-w-[50px] w-8 pb-3 pr-4" />}
              {showRowNumbers && <th className="min-w-[50px] w-10 pb-3 pr-4 font-medium">STT</th>}
              {columns.map((column, index) => (
                <th
                  key={column.id ?? ('accessorKey' in column ? String(column.accessorKey) : index)}
                  className={cn(
                    'min-w-[50px] pb-3 font-medium',
                    index < columns.length - 1 ? 'pr-4' : undefined,
                    column.meta?.headerClassName,
                  )}
                >
                  {typeof column.header === 'string' ? column.header : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-border/50">
                <td colSpan={colCount} className="py-3">
                  <div className="h-4 animate-pulse rounded bg-neutral-800" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-neutral-400">{emptyMessage}</p>
        {emptyDescription ? <p className="mt-1 text-xs text-neutral-500">{emptyDescription}</p> : null}
      </div>
    );
  }

  const handleRowClick = (row: Row<TData>) => {
    onRowClick?.(row.original);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>{headerRow}</thead>
        <tbody>
          {table.getRowModel().rows.map(row => {
            const id = row.id;
            const isActive =
              activeRowId != null ? activeRowId === id : enableRowSelection && !!selectedIds?.has(id);
            return (
              <tr
                key={id}
                onClick={onRowClick ? () => handleRowClick(row) : undefined}
                className={cn(
                  'border-b border-border/50 transition-colors',
                  onRowClick ? 'cursor-pointer' : undefined,
                  isActive ? 'bg-primary-500/10' : onRowClick ? 'hover:bg-surface-elevated/50' : undefined,
                )}
              >
                {enableRowSelection && (
                  <SelectionCell
                    checked={!!selectedIds?.has(id)}
                    onToggle={onToggleRow ? () => onToggleRow(id) : undefined}
                  />
                )}
                {showRowNumbers && <RowNumberCell value={rowNumberStart + row.index} />}
                {row.getVisibleCells().map((cell, index) => (
                  <td
                    key={cell.id}
                    className={cn(
                      'min-w-[50px] py-3',
                      index < row.getVisibleCells().length - 1 ? 'pr-4' : undefined,
                      cell.column.columnDef.meta?.cellClassName,
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
