import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
} from '@tanstack/react-table'
import type { KeyboardEvent } from 'react'
import { cn } from '../../lib/cn'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    headerClassName?: string
    cellClassName?: string
  }
}

export type DataTableProps<TData> = {
  data: TData[]
  columns: ColumnDef<TData, unknown>[]
  getRowId: (row: TData) => string
  loading?: boolean
  emptyMessage?: string
  emptyDescription?: string
  selectedIds?: Set<string>
  onToggleRow?: (id: string) => void
  onToggleAll?: () => void
  enableRowSelection?: boolean
  activeRowId?: string | null
  onRowClick?: (row: TData) => void
  error?: string | null
  showRowNumbers?: boolean
  rowNumberStart?: number
}

const checkboxClassName = 'size-3.5 rounded border-border bg-surface accent-primary-500'

const stickyHeaderClass =
  'sticky top-0 z-10 bg-surface shadow-[0_1px_0_0_var(--color-border)]'

function SelectionHeader({
  allSelected,
  onToggleAll,
}: {
  allSelected: boolean
  onToggleAll?: () => void
}) {
  return (
    <th className={cn(stickyHeaderClass, 'min-w-[50px] w-10 pb-3 pr-4')}>
      <label className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md hover:bg-muted">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          className={checkboxClassName}
          aria-label="Select all rows"
        />
      </label>
    </th>
  )
}

function SelectionCell({
  checked,
  onToggle,
}: {
  checked: boolean
  onToggle?: () => void
}) {
  return (
    <td className="min-w-[50px] py-2.5 pr-4" onClick={(e) => e.stopPropagation()}>
      <label className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md hover:bg-muted">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className={checkboxClassName}
          aria-label="Select row"
        />
      </label>
    </td>
  )
}

function RowNumberHeader() {
  return (
    <th className={cn(stickyHeaderClass, 'min-w-[50px] w-10 pb-3 pr-4 font-medium')}>STT</th>
  )
}

function RowNumberCell({ value }: { value: number }) {
  return <td className="min-w-[50px] py-2.5 pr-4 tabular-nums text-muted-foreground">{value}</td>
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
    getRowId: (row) => getRowId(row),
  })

  const colCount = columns.length + (enableRowSelection ? 1 : 0) + (showRowNumbers ? 1 : 0)
  const allSelected = data.length > 0 && !!selectedIds && selectedIds.size === data.length
  const isInteractive = Boolean(onRowClick)

  const headerRow = (
    <tr className="border-b border-border text-xs text-muted-foreground">
      {enableRowSelection && <SelectionHeader allSelected={allSelected} onToggleAll={onToggleAll} />}
      {showRowNumbers && <RowNumberHeader />}
      {table.getHeaderGroups().map((headerGroup) =>
        headerGroup.headers.map((header) => (
          <th
            key={header.id}
            className={cn(
              stickyHeaderClass,
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
  )

  if (loading) {
    return (
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            {enableRowSelection && <th className="min-w-[50px] w-10 pb-3 pr-4" />}
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
              <td colSpan={colCount} className="py-2.5">
                <div className="h-4 animate-pulse rounded bg-muted" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-danger">{error}</p>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        {emptyDescription ? <p className="mt-1 text-xs text-muted-foreground">{emptyDescription}</p> : null}
      </div>
    )
  }

  const handleRowActivate = (row: Row<TData>) => {
    onRowClick?.(row.original)
  }

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: Row<TData>) => {
    if (!isInteractive) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleRowActivate(row)
    }
  }

  return (
    <table className="w-full text-left text-sm">
      <thead>{headerRow}</thead>
      <tbody>
        {table.getRowModel().rows.map((row) => {
          const id = row.id
          const isActive =
            activeRowId != null ? activeRowId === id : enableRowSelection && !!selectedIds?.has(id)
          return (
            <tr
              key={id}
              onClick={isInteractive ? () => handleRowActivate(row) : undefined}
              onKeyDown={isInteractive ? (event) => handleRowKeyDown(event, row) : undefined}
              tabIndex={isInteractive ? 0 : undefined}
              aria-selected={isActive || undefined}
              className={cn(
                'border-b border-border/50 transition-colors duration-150',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                isInteractive ? 'cursor-pointer' : 'cursor-default',
                isActive
                  ? cn('bg-primary-500/10', isInteractive && 'hover:bg-primary-500/15')
                  : isInteractive
                    ? 'hover:bg-muted/80'
                    : undefined,
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
                    'min-w-[50px] py-2.5',
                    index < row.getVisibleCells().length - 1 ? 'pr-4' : undefined,
                    cell.column.columnDef.meta?.cellClassName,
                  )}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
