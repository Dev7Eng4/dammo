import { Button, DropdownSelect, Input } from '../ui';
import {
  PROMPT_CATEGORY_OPTIONS,
  PROMPT_FORM_LANGUAGE_OPTIONS,
} from '../../constants/promptForm';
import { derivePromptKeyFromName } from '../../utils/promptVariables';
import { planStepKeys, resolveDraftBaseKey } from '../../utils/promptSets';
import type { PromptFormDraft, PromptStepDraft } from '../../types/prompt';
import { PromptStepEditor } from './PromptStepEditor';

export interface PromptEditorPanelProps {
  draft: PromptFormDraft | null;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  readOnly?: boolean;
  saveError?: string | null;
  onChange: (patch: Partial<PromptFormDraft>) => void;
  onStepChange: (index: number, patch: Partial<PromptStepDraft>) => void;
  onAddStep: () => void;
  onRemoveStep: (index: number) => void;
  onSave: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <span className="text-xs font-medium text-neutral-400">
      {children}
      {optional ? <span className="text-neutral-500"> (tuỳ chọn)</span> : null}
    </span>
  );
}

export function PromptEditorPanel({
  draft,
  loading,
  saving,
  dirty,
  readOnly = false,
  saveError,
  onChange,
  onStepChange,
  onAddStep,
  onRemoveStep,
  onSave,
  onDuplicate,
  onDelete,
}: PromptEditorPanelProps) {
  if (!draft && !loading) {
    return (
      <section className="flex min-w-0 flex-1 flex-col items-center justify-center bg-background p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-surface-elevated">
          <svg
            className="size-6 text-neutral-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
          >
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
          </svg>
        </div>
        <p className="mt-4 text-sm font-medium text-neutral-200">Chọn một prompt từ danh sách</p>
        <p className="mt-1 text-xs text-neutral-500">
          Hoặc bấm <span className="font-medium text-neutral-400">+ Mới</span> để tạo mới
        </p>
      </section>
    );
  }

  if (loading || !draft) {
    return (
      <section className="flex min-w-0 flex-1 flex-col bg-background p-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-elevated" />
        <div className="mt-6 h-64 animate-pulse rounded-xl bg-surface-elevated" />
      </section>
    );
  }

  const isNew = !draft.steps.some((step) => step.id);
  const baseKey = isNew ? derivePromptKeyFromName(draft.name) : resolveDraftBaseKey(draft);
  const plannedKeys = planStepKeys(baseKey, draft.steps.length);
  const displayKey =
    draft.steps.length > 1 ? `${baseKey}_step_1…${draft.steps.length}` : plannedKeys[0] ?? baseKey;
  const hasSavedStep = draft.steps.some((step) => step.id);
  const headerTitle = isNew ? 'Prompt mới' : draft.name || 'Prompt chưa đặt tên';

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-semibold text-neutral-50">{headerTitle}</h1>
            {isNew ? (
              <span className="inline-flex rounded-full border border-primary-400/30 bg-primary-400/10 px-2 py-0.5 text-[10px] font-medium text-primary-300">
                Nháp
              </span>
            ) : (
              <span className="inline-flex rounded-full border border-border bg-surface-elevated px-2 py-0.5 font-mono text-[10px] text-neutral-400">
                {displayKey}
              </span>
            )}
            {draft.steps.length > 1 ? (
              <span className="inline-flex rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-[10px] text-neutral-400">
                {draft.steps.length} step
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!readOnly ? (
            <Button variant="outlined" size="sm" onClick={onAddStep} disabled={saving}>
              Thêm step
            </Button>
          ) : null}
          <Button variant="outlined" size="sm" onClick={onDuplicate} disabled={saving}>
            Nhân bản
          </Button>
          {!readOnly ? (
            <>
              <Button variant="danger" size="sm" onClick={onDelete} disabled={saving || !hasSavedStep}>
                Xóa
              </Button>
              <Button size="sm" onClick={onSave} disabled={saving || !dirty || !draft.name.trim()}>
                {saving ? 'Đang lưu...' : 'Lưu'}
              </Button>
            </>
          ) : null}
        </div>
      </header>

      {readOnly ? (
        <div className="border-b border-l-2 border-warning/50 bg-warning/5 px-6 py-2">
          <p className="text-xs text-warning">Prompt hệ thống — chỉ xem</p>
        </div>
      ) : null}

      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-6">
        <div className="card-surface space-y-4 rounded-xl p-4">
          <h2 className="text-sm font-medium text-neutral-100">Chung</h2>

          <label className="block space-y-1.5">
            <FieldLabel>Tên</FieldLabel>
            <Input
              value={draft.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Tên prompt"
              className="h-10 rounded-lg"
              readOnly={readOnly}
              disabled={readOnly}
              required
            />
            {saveError ? (
              <p className="text-xs text-danger">{saveError}</p>
            ) : isNew ? (
              <p className="text-xs text-neutral-500">
                Sẽ lưu với key <span className="font-mono text-neutral-400">{displayKey}</span>
              </p>
            ) : null}
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <FieldLabel>Ngôn ngữ</FieldLabel>
              <DropdownSelect
                value={draft.language}
                onChange={(language) => onChange({ language })}
                options={PROMPT_FORM_LANGUAGE_OPTIONS}
                disabled={readOnly}
                className="w-full"
                triggerClassName="h-10 w-full rounded-lg"
              />
            </label>
            <label className="block space-y-1.5">
              <FieldLabel>Danh mục</FieldLabel>
              <DropdownSelect
                value={draft.category}
                onChange={(category) => onChange({ category })}
                options={PROMPT_CATEGORY_OPTIONS}
                disabled={readOnly}
                className="w-full"
                triggerClassName="h-10 w-full rounded-lg"
              />
            </label>
          </div>
        </div>

        {draft.steps.map((step, index) => (
          <PromptStepEditor
            key={step.localId}
            step={step}
            index={index}
            category={draft.category}
            readOnly={readOnly}
            canRemove={draft.steps.length > 1}
            onChange={(patch) => onStepChange(index, patch)}
            onRemove={() => onRemoveStep(index)}
          />
        ))}
      </div>
    </section>
  );
}
