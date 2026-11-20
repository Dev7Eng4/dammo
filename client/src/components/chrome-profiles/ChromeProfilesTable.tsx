import { type ColumnDef } from '@tanstack/react-table';
import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LLM_CONTENT_OPTIONS,
  LLM_IMAGE_OPTIONS,
  LLM_VIDEO_OPTIONS,
  type ChromeProfile,
  type ChromeProfileLlmField,
} from '../../types/chromeProfile';
import { DataTable, MultiSelect } from '../ui';

interface ChromeProfilesTableProps {
  profiles: ChromeProfile[];
  selectedId: string | null;
  loading?: boolean;
  onSelect: (id: string) => void;
  onLlmChange: (id: string, field: ChromeProfileLlmField, value: string[]) => void;
}

const LLM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  claude: 'Claude',
  meta: 'Meta',
  flow: 'Flow',
};

const LLM_COLUMNS: {
  field: ChromeProfileLlmField;
  options: readonly string[];
}[] = [
  { field: 'llmContent', options: LLM_CONTENT_OPTIONS },
  { field: 'llmImage', options: LLM_IMAGE_OPTIONS },
  { field: 'llmVideo', options: LLM_VIDEO_OPTIONS },
];

export function ChromeProfilesTable({
  profiles,
  selectedId,
  loading,
  onSelect,
  onLlmChange,
}: ChromeProfilesTableProps) {
  const { t } = useTranslation('browser');

  // flexRender mounts each cell as a component, so new cell functions on every render would
  // remount cells (and close an open LLM menu). Keep columns stable; read callbacks via a ref.
  const handlersRef = useRef({ onLlmChange });
  handlersRef.current = { onLlmChange };

  const columns = useMemo<ColumnDef<ChromeProfile, unknown>[]>(() => {
    return [
      {
        accessorKey: 'name',
        header: t('chrome.table.col.name'),
        cell: ({ getValue }) => {
          const name = getValue<string>();
          return (
            <span className="block truncate font-medium text-neutral-100" title={name}>
              {name}
            </span>
          );
        },
      },
      ...LLM_COLUMNS.map(({ field, options }): ColumnDef<ChromeProfile, unknown> => ({
        id: field,
        header: t(`chrome.table.col.${field}`),
        cell: ({ row }) => {
          const profile = row.original;
          return (
            // Stop clicks (incl. the portaled menu, which bubbles through React) from selecting the row.
            <div onClick={e => e.stopPropagation()}>
              <MultiSelect
                options={options.map(option => ({
                  value: option,
                  label: LLM_LABELS[option] ?? option,
                }))}
                value={profile[field] ?? []}
                onChange={value => handlersRef.current.onLlmChange(profile.id, field, value)}
                placeholder={t('chrome.table.llmNone')}
                className="w-full"
                triggerClassName="min-h-7 py-1 text-xs"
              />
            </div>
          );
        },
      })),
      {
        accessorKey: 'id',
        header: t('chrome.table.col.profileId'),
        cell: ({ getValue }) => {
          const id = getValue<string>();
          return (
            <span className="block truncate font-mono text-xs text-neutral-300" title={id}>
              {id}
            </span>
          );
        },
      },
    ];
  }, [t]);

  return (
    <DataTable
      data={profiles}
      columns={columns}
      getRowId={profile => profile.id}
      loading={loading}
      activeRowId={selectedId}
      onRowClick={profile => onSelect(profile.id)}
      emptyMessage={t('chrome.table.empty')}
      layout="fixed"
    />
  );
}
