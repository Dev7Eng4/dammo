import { useState } from 'react';
import { Button, DropdownSelect, Input, Textarea } from '../ui';
import {
  PROMPT_CATEGORY_OPTIONS,
  PROMPT_FORM_LANGUAGE_OPTIONS,
  PROMPT_LANGUAGE_OPTIONS,
  PROMPT_OUTPUT_TYPE_OPTIONS,
} from '../../constants/promptForm';
import {
  derivePromptKeyFromName,
  isUserFunctionTemplate,
  normalizeVariableName,
} from '../../utils/promptVariables';
import { cn } from '../../lib/cn';
import type { PromptFormDraft, PromptStepFormValues } from '../../types/prompt';

export interface PromptEditorPanelProps {
  draft: PromptFormDraft | null;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  readOnly?: boolean;
  saveError?: string | null;
  onChange: (patch: Partial<PromptFormDraft>) => void;
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

function createEmptyStep(order: number): PromptStepFormValues {
  return {
    id: crypto.randomUUID(),
    order,
    name: `Step ${order + 1}`,
    outputType: 'text',
    useReferenceImage: false,
    useChannelBackgroundImage: false,
    templateParams: [],
    outputSchemaText: '',
    template: '',
  };
}

function supportsReferenceImage(category: string): boolean {
  return category === 'thumbnail' || category === 'image';
}

function supportsChannelBackgroundImage(category: string): boolean {
  return category === 'thumbnail';
}

export function PromptEditorPanel({
  draft,
  loading,
  saving,
  dirty,
  readOnly = false,
  saveError,
  onChange,
  onSave,
  onDuplicate,
  onDelete,
}: PromptEditorPanelProps) {
  const [insertVarByStepId, setInsertVarByStepId] = useState<Record<string, string>>({});

  if (!draft && !loading) {
    return (
      <section className="flex min-w-0 flex-1 flex-col items-center justify-center bg-background p-8 text-center">
        <p className="mt-4 text-sm font-medium text-neutral-200">Chọn một bộ prompt từ danh sách</p>
        <p className="mt-1 text-xs text-neutral-500">
          Hoặc bấm <span className="font-medium text-neutral-400">+ Mới</span> để tạo bộ mới
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

  const isNew = !draft.id;
  const displayKey = draft.id ? draft.key : derivePromptKeyFromName(draft.name);
  const showReferenceImageOption = supportsReferenceImage(draft.category);
  const showBackgroundOption = supportsChannelBackgroundImage(draft.category);

  function updateStep(index: number, patch: Partial<PromptStepFormValues>) {
    const steps = draft!.steps.map((step, i) => (i === index ? { ...step, ...patch } : step));
    onChange({ steps });
  }

  function handleAddStep() {
    const steps = [...draft!.steps, createEmptyStep(draft!.steps.length)];
    onChange({ steps, activeStepIndex: steps.length - 1 });
  }

  function handleRemoveStep(index: number) {
    if (draft!.steps.length <= 1) return;
    const removedId = draft!.steps[index]?.id;
    const steps = draft!.steps.filter((_, i) => i !== index).map((step, i) => ({ ...step, order: i }));
    const activeStepIndex =
      draft!.activeStepIndex > index
        ? draft!.activeStepIndex - 1
        : Math.min(draft!.activeStepIndex, steps.length - 1);
    onChange({ steps, activeStepIndex });
    if (removedId) {
      setInsertVarByStepId(prev => {
        const next = { ...prev };
        delete next[removedId];
        return next;
      });
    }
  }

  function handleInsertVariable(index: number) {
    if (readOnly) return;
    const step = draft!.steps[index];
    if (!step) return;
    const name = normalizeVariableName(insertVarByStepId[step.id] ?? '');
    if (!name || step.templateParams.includes(name)) return;
    updateStep(index, { templateParams: [...step.templateParams, name] });
    setInsertVarByStepId(prev => ({ ...prev, [step.id]: '' }));
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-semibold text-neutral-50">
              {isNew ? 'Bộ prompt mới' : draft.name || 'Bộ chưa đặt tên'}
            </h1>
            {isNew ? (
              <span className="inline-flex rounded-full border border-primary-400/30 bg-primary-400/10 px-2 py-0.5 text-[10px] font-medium text-primary-300">
                Nháp
              </span>
            ) : (
              <span className="inline-flex rounded-full border border-border bg-surface-elevated px-2 py-0.5 font-mono text-[10px] text-neutral-400">
                {displayKey}
              </span>
            )}
            {draft.isDefault ? (
              <span className="inline-flex rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                Default
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {!readOnly ? (
            <Button variant="outlined" size="sm" onClick={handleAddStep} disabled={saving}>
              + Thêm step
            </Button>
          ) : null}
          <Button variant="outlined" size="sm" onClick={onDuplicate} disabled={saving}>
            Nhân bản
          </Button>
          {!readOnly ? (
            <Button variant="danger" size="sm" onClick={onDelete} disabled={saving || !draft.id}>
              Xóa
            </Button>
          ) : null}
          <Button size="sm" onClick={onSave} disabled={saving || !dirty || (!readOnly && !draft.name.trim())}>
            {saving ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </div>
      </header>

      {readOnly ? (
        <div className="border-b border-l-2 border-warning/50 bg-warning/5 px-6 py-2">
          <p className="text-xs text-warning">Bộ hệ thống — chỉ được đổi đặt làm mặc định</p>
        </div>
      ) : null}

      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-6">
        <div className="card-surface space-y-4 rounded-xl p-4">
          <h2 className="text-sm font-medium text-neutral-100">Chung (bộ prompt)</h2>

          <label className="block space-y-1.5">
            <FieldLabel>Tên</FieldLabel>
            <Input
              value={draft.name}
              onChange={e => onChange({ name: e.target.value })}
              placeholder="Tên bộ prompt"
              className="h-10 rounded-lg"
              readOnly={readOnly}
              disabled={readOnly}
              required
            />
            {saveError ? <p className="text-xs text-danger">{saveError}</p> : null}
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block space-y-1.5">
              <FieldLabel>Ngôn ngữ</FieldLabel>
              <DropdownSelect
                value={draft.language}
                onChange={language => onChange({ language })}
                options={isNew ? PROMPT_FORM_LANGUAGE_OPTIONS : PROMPT_LANGUAGE_OPTIONS}
                disabled={readOnly}
                className="w-full"
                triggerClassName="h-10 w-full rounded-lg"
              />
            </label>
            <label className="block space-y-1.5">
              <FieldLabel>Danh mục</FieldLabel>
              <DropdownSelect
                value={draft.category}
                onChange={category => onChange({ category })}
                options={PROMPT_CATEGORY_OPTIONS}
                disabled={readOnly}
                className="w-full"
                triggerClassName="h-10 w-full rounded-lg"
              />
            </label>
            <label className="flex items-end gap-2 pb-1">
              <input
                type="checkbox"
                checked={draft.isDefault}
                onChange={e => onChange({ isDefault: e.target.checked })}
                className="h-4 w-4 rounded border-neutral-600 bg-neutral-900"
              />
              <span className="text-sm text-neutral-200">Đặt làm mặc định</span>
            </label>
          </div>

          <label className="block space-y-1.5">
            <FieldLabel optional>Mô tả</FieldLabel>
            <Textarea
              value={draft.description}
              onChange={e => onChange({ description: e.target.value })}
              rows={2}
              className="text-sm"
              readOnly={readOnly}
              disabled={readOnly}
            />
          </label>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-neutral-100">Steps ({draft.steps.length})</h2>

          <div className="space-y-4">
            {draft.steps.map((step, index) => {
              const isActive = index === draft.activeStepIndex;
              const userFunctionTemplate = isUserFunctionTemplate(step.template);

              return (
                <div
                  key={step.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onChange({ activeStepIndex: index })}
                  onFocus={() => onChange({ activeStepIndex: index })}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onChange({ activeStepIndex: index });
                    }
                  }}
                  className={cn(
                    'card-surface space-y-4 rounded-xl border p-4 outline-none transition-colors',
                    isActive
                      ? 'border-primary-400/60 ring-1 ring-primary-400/30'
                      : 'border-transparent hover:border-border',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-neutral-300">
                      Step {index + 1}
                      {isActive ? (
                        <span className="ml-2 text-[10px] font-normal text-primary-300">
                          (playground)
                        </span>
                      ) : null}
                    </p>
                    {!readOnly && draft.steps.length > 1 ? (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={e => {
                          e.stopPropagation();
                          handleRemoveStep(index);
                        }}
                      >
                        Xóa step
                      </Button>
                    ) : null}
                  </div>

                  <label className="block space-y-1.5">
                    <FieldLabel optional>Tên step</FieldLabel>
                    <Input
                      value={step.name}
                      onChange={e => updateStep(index, { name: e.target.value })}
                      onClick={e => e.stopPropagation()}
                      className="h-10 rounded-lg"
                      disabled={readOnly}
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <FieldLabel>Loại</FieldLabel>
                    <div onClick={e => e.stopPropagation()}>
                      <DropdownSelect
                        value={step.outputType}
                        onChange={outputType => updateStep(index, { outputType })}
                        options={PROMPT_OUTPUT_TYPE_OPTIONS}
                        disabled={readOnly}
                        className="w-full"
                        triggerClassName="h-10 w-full rounded-lg"
                      />
                    </div>
                  </label>

                  {showReferenceImageOption ? (
                    <label
                      className="flex items-center gap-2 text-sm text-neutral-200"
                      onClick={e => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={step.useReferenceImage}
                        onChange={e => updateStep(index, { useReferenceImage: e.target.checked })}
                        disabled={readOnly}
                        className="h-4 w-4 rounded border-neutral-600 bg-neutral-900"
                      />
                      Dùng ảnh tham chiếu
                    </label>
                  ) : null}

                  {showBackgroundOption ? (
                    <label
                      className="flex items-center gap-2 text-sm text-neutral-200"
                      onClick={e => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={step.useChannelBackgroundImage}
                        onChange={e =>
                          updateStep(index, { useChannelBackgroundImage: e.target.checked })
                        }
                        disabled={readOnly}
                        className="h-4 w-4 rounded border-neutral-600 bg-neutral-900"
                      />
                      Dùng ảnh nền channel
                    </label>
                  ) : null}

                  <label className="block space-y-1.5">
                    <FieldLabel>Mẫu prompt</FieldLabel>
                    <Textarea
                      value={step.template}
                      onChange={e => updateStep(index, { template: e.target.value })}
                      onClick={e => e.stopPropagation()}
                      rows={10}
                      className="font-mono text-sm"
                      readOnly={readOnly}
                      disabled={readOnly}
                    />
                  </label>

                  {!userFunctionTemplate ? (
                    <div className="space-y-2" onClick={e => e.stopPropagation()}>
                      <FieldLabel optional>Biến input</FieldLabel>
                      <div className="flex flex-wrap gap-2">
                        {step.templateParams.map(name => (
                          <button
                            key={name}
                            type="button"
                            disabled={readOnly}
                            onClick={() =>
                              updateStep(index, {
                                templateParams: step.templateParams.filter(p => p !== name),
                              })
                            }
                            className="rounded-full border border-border px-2 py-0.5 text-[11px] text-neutral-300"
                          >
                            {name} ×
                          </button>
                        ))}
                      </div>
                      {!readOnly ? (
                        <div className="flex gap-2">
                          <Input
                            value={insertVarByStepId[step.id] ?? ''}
                            onChange={e =>
                              setInsertVarByStepId(prev => ({
                                ...prev,
                                [step.id]: e.target.value,
                              }))
                            }
                            placeholder="tên_biến"
                            className="h-9 rounded-lg"
                          />
                          <Button
                            size="sm"
                            variant="outlined"
                            onClick={() => handleInsertVariable(index)}
                          >
                            Thêm
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <label className="block space-y-1.5">
                    <FieldLabel optional>Object output (JSON Schema)</FieldLabel>
                    <Textarea
                      value={step.outputSchemaText}
                      onChange={e => updateStep(index, { outputSchemaText: e.target.value })}
                      onClick={e => e.stopPropagation()}
                      rows={4}
                      placeholder='{"type":"object","properties":{...}}'
                      className="font-mono text-xs"
                      readOnly={readOnly}
                      disabled={readOnly}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
