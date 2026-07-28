import { useState } from 'react';
import { Button, DropdownSelect, Input, Textarea } from '../ui';
import { PROMPT_OUTPUT_TYPE_OPTIONS } from '../../constants/promptForm';
import {
  estimateTokens,
  isUserFunctionTemplate,
  normalizeVariableName,
} from '../../utils/promptVariables';
import type { PromptCategory, PromptStepDraft } from '../../types/prompt';

export interface PromptStepEditorProps {
  step: PromptStepDraft;
  index: number;
  category: PromptCategory;
  readOnly?: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<PromptStepDraft>) => void;
  onRemove: () => void;
}

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <span className="text-xs font-medium text-neutral-400">
      {children}
      {optional ? <span className="text-neutral-500"> (tuỳ chọn)</span> : null}
    </span>
  );
}

export function PromptStepEditor({
  step,
  index,
  category,
  readOnly = false,
  canRemove,
  onChange,
  onRemove,
}: PromptStepEditorProps) {
  const [insertVarName, setInsertVarName] = useState('');
  const tokenEstimate = estimateTokens(step.template);
  const userFunctionTemplate = isUserFunctionTemplate(step.template);
  const showReferenceImageOption = category === 'thumbnail' || category === 'image';
  const exportDefaultPreview =
    step.templateParams.length > 0
      ? `export default (${step.templateParams.join(', ')}) => \`...\``
      : 'export default () => `...`';

  function handleInsertVariable() {
    if (readOnly) return;
    const name = normalizeVariableName(insertVarName);
    if (!name || step.templateParams.includes(name)) return;
    onChange({ templateParams: [...step.templateParams, name] });
    setInsertVarName('');
  }

  function handleRemoveVariable(name: string) {
    if (readOnly) return;
    onChange({ templateParams: step.templateParams.filter((param) => param !== name) });
  }

  return (
    <div className="card-surface space-y-4 rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-neutral-100">Bước {index + 1}</h2>
          {step.key ? (
            <p className="mt-0.5 font-mono text-[10px] text-neutral-500">{step.key}</p>
          ) : null}
        </div>
        {canRemove && !readOnly ? (
          <Button variant="danger" size="sm" onClick={onRemove}>
            Xóa step
          </Button>
        ) : null}
      </div>

      <label className="block space-y-1.5">
        <FieldLabel>Loại</FieldLabel>
        <DropdownSelect
          value={step.outputType}
          onChange={(outputType) => onChange({ outputType })}
          options={PROMPT_OUTPUT_TYPE_OPTIONS}
          disabled={readOnly}
          className="w-full"
          triggerClassName="h-10 w-full rounded-lg"
        />
        <p className="text-[10px] text-neutral-500">
          Văn bản → LLM · Hình ảnh → Flow/Meta · Video → Meta AI
        </p>
      </label>

      {showReferenceImageOption ? (
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface-elevated/50 px-3 py-2.5">
          <div>
            <p className="text-xs font-medium text-neutral-300">Dùng ảnh tham chiếu</p>
            <p className="text-[10px] text-neutral-500">Đính kèm ảnh tham chiếu khi tạo</p>
          </div>
          <input
            type="checkbox"
            checked={step.useReferenceImage}
            onChange={(e) => onChange({ useReferenceImage: e.target.checked })}
            disabled={readOnly}
            className="size-3.5 shrink-0 rounded border-border bg-surface accent-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      ) : null}

      {category === 'thumbnail' ? (
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface-elevated/50 px-3 py-2.5">
          <div>
            <p className="text-xs font-medium text-neutral-300">Dùng ảnh nền của kênh</p>
            <p className="text-[10px] text-neutral-500">Dùng ảnh nền kênh YouTube khi tạo thumbnail</p>
          </div>
          <input
            type="checkbox"
            checked={step.useChannelBackgroundImage}
            onChange={(e) => onChange({ useChannelBackgroundImage: e.target.checked })}
            disabled={readOnly}
            className="size-3.5 shrink-0 rounded border-border bg-surface accent-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      ) : null}

      <label className="block space-y-1.5">
        <FieldLabel optional>Mô tả</FieldLabel>
        <Input
          value={step.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Mô tả ngắn"
          className="h-10 rounded-lg"
          readOnly={readOnly}
          disabled={readOnly}
        />
      </label>

      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-neutral-100">Mẫu User Prompt</h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              {userFunctionTemplate ? (
                <>Mẫu function — không dùng biến</>
              ) : (
                <>
                  Lưu dạng <code className="text-neutral-400">{exportDefaultPreview}</code> · dùng{' '}
                  <code className="text-neutral-400">${'{param}'}</code> trong nội dung
                </>
              )}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-[10px] text-neutral-500">
            ~{tokenEstimate} tokens
          </span>
        </div>
        <Textarea
          value={step.template}
          onChange={(e) => onChange({ template: e.target.value })}
          rows={12}
          className="min-h-[240px] font-mono text-xs leading-relaxed"
          placeholder="Viết nội dung mẫu prompt..."
          readOnly={readOnly}
          disabled={readOnly}
        />
        {!userFunctionTemplate && !readOnly ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={insertVarName}
                onChange={(e) => setInsertVarName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleInsertVariable();
                  }
                }}
                placeholder="variable_name"
                className="h-9 min-w-0 flex-1 rounded-lg font-mono text-xs"
              />
              <Button variant="secondary" size="sm" className="shrink-0" onClick={handleInsertVariable}>
                Thêm biến
              </Button>
            </div>
            {step.templateParams.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {step.templateParams.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-elevated px-2.5 py-1 font-mono text-xs text-neutral-200"
                  >
                    {name}
                    <button
                      type="button"
                      onClick={() => handleRemoveVariable(name)}
                      className="rounded-full px-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
                      aria-label={`Xóa ${name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : !userFunctionTemplate && readOnly && step.templateParams.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {step.templateParams.map((name) => (
              <span
                key={name}
                className="inline-flex items-center rounded-full border border-border bg-surface-elevated px-2.5 py-1 font-mono text-xs text-neutral-200"
              >
                {name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
