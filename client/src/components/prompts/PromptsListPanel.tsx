import { useMemo } from 'react';
import { SearchInput, DropdownSelect, Button } from '../ui';
import {
  PROMPT_CATEGORY_OPTIONS,
  PROMPT_CATEGORY_LABELS,
  PROMPT_LANGUAGE_LABELS,
  PROMPT_LANGUAGE_OPTIONS,
} from '../../constants/promptForm';
import { cn } from '../../lib/cn';
import { groupPromptSets } from '../../utils/promptSets';
import type { Prompt, PromptCategory, PromptLanguage } from '../../types/prompt';

export type PromptListLanguageFilter = 'any' | PromptLanguage;

export interface PromptsListPanelProps {
  prompts: Prompt[];
  loading: boolean;
  selectedId: string | null;
  search: string;
  categoryFilter: PromptCategory | 'all';
  languageFilter: PromptListLanguageFilter;
  onSearchChange: (value: string) => void;
  onCategoryFilterChange: (value: PromptCategory | 'all') => void;
  onLanguageFilterChange: (value: PromptListLanguageFilter) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
}

const categoryFilterOptions = [
  { value: 'all' as const, label: 'Tất cả danh mục' },
  ...PROMPT_CATEGORY_OPTIONS,
];

const languageFilterOptions = [
  { value: 'any' as const, label: 'Tất cả ngôn ngữ' },
  { value: 'all' as const, label: 'Namespace ALL' },
  ...PROMPT_LANGUAGE_OPTIONS,
];

function categoryBadgeClass(category: PromptCategory): string {
  switch (category) {
    case 'thumbnail':
      return 'bg-tertiary-500/15 text-tertiary-300 border-tertiary-500/30';
    case 'transcript':
      return 'bg-info/15 text-info border-info/30';
    case 'meta':
      return 'bg-primary-400/15 text-primary-300 border-primary-400/30';
    case 'image':
      return 'bg-secondary-400/15 text-secondary-300 border-secondary-400/30';
  }
}

export function PromptsListPanel({
  prompts,
  loading,
  selectedId,
  search,
  categoryFilter,
  languageFilter,
  onSearchChange,
  onCategoryFilterChange,
  onLanguageFilterChange,
  onSelect,
  onNew,
}: PromptsListPanelProps) {
  const sets = useMemo(() => groupPromptSets(prompts), [prompts]);

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="space-y-3 border-b border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-100">Prompts</h2>
          <Button size="sm" onClick={onNew}>
            + Mới
          </Button>
        </div>
        <SearchInput
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Tìm prompt..."
          className="h-9 text-sm"
        />
        <div className="grid grid-cols-1 gap-2">
          <DropdownSelect
            value={categoryFilter}
            onChange={onCategoryFilterChange}
            options={categoryFilterOptions}
            className="w-full"
            triggerClassName="h-9 w-full rounded-lg text-xs"
          />
          <DropdownSelect
            value={languageFilter}
            onChange={onLanguageFilterChange}
            options={languageFilterOptions}
            className="w-full"
            triggerClassName="h-9 w-full rounded-lg text-xs"
          />
        </div>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-elevated" />
            ))}
          </div>
        ) : sets.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-neutral-500">Không tìm thấy prompt</p>
        ) : (
          <ul className="space-y-1">
            {sets.map((set) => {
              const isSelected = selectedId !== null && set.memberIds.includes(selectedId);
              return (
                <li key={`${set.language}:${set.name}:${set.id}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(set.id)}
                    className={cn(
                      'w-full rounded-lg px-3 py-2.5 text-left transition-colors',
                      isSelected
                        ? 'bg-secondary-600/20 ring-1 ring-secondary-500/50'
                        : 'hover:bg-surface-elevated',
                    )}
                  >
                    <p className="truncate text-sm font-medium text-neutral-100">{set.name}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium',
                          categoryBadgeClass(set.category),
                        )}
                      >
                        {PROMPT_CATEGORY_LABELS[set.category]}
                      </span>
                      <span className="inline-flex rounded-full border border-border bg-neutral-800/80 px-2 py-0.5 text-[10px] font-medium text-neutral-400">
                        {PROMPT_LANGUAGE_LABELS[set.language]}
                      </span>
                      {set.stepCount > 1 ? (
                        <span className="inline-flex rounded-full border border-border bg-neutral-800/80 px-2 py-0.5 text-[10px] font-medium text-neutral-300">
                          {set.stepCount} step
                        </span>
                      ) : null}
                      {set.isSystem ? (
                        <span className="inline-flex rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                          Hệ thống
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate font-mono text-[10px] text-neutral-500">{set.key}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
