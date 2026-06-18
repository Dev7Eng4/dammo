import { useState } from 'react';
import { Button, DropdownSelect, Input, Textarea } from '../ui';
import {
  PROMPT_CATEGORY_OPTIONS,
  PROMPT_LANGUAGE_OPTIONS,
} from '../../constants/promptForm';
import { estimateTokens, isUserFunctionTemplate, normalizeVariableName } from '../../utils/promptVariables';
import type { PromptFormDraft } from '../../types/prompt';

export interface PromptEditorPanelProps {
  draft: PromptFormDraft | null;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  saveError?: string | null;
  onChange: (patch: Partial<PromptFormDraft>) => void;
  onSave: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function PromptEditorPanel({
  draft,
  loading,
  saving,
  dirty,
  saveError,
  onChange,
  onSave,
  onDuplicate,
  onDelete,
}: PromptEditorPanelProps) {
  const [insertVarName, setInsertVarName] = useState('');

  function handleInsertVariable() {
    if (!draft) return;
    const name = normalizeVariableName(insertVarName);
    if (!name || draft.templateParams.includes(name)) return;

    onChange({ templateParams: [...draft.templateParams, name] });
    setInsertVarName('');
  }

  function handleRemoveVariable(name: string) {
    if (!draft) return;
    onChange({ templateParams: draft.templateParams.filter((param) => param !== name) });
  }

  if (!draft && !loading) {
    return (
      <section className="flex min-w-0 flex-1 flex-col items-center justify-center bg-background p-8 text-center">
        <p className="text-sm text-neutral-500">Select a prompt or create a new one</p>
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

  const tokenEstimate = estimateTokens(draft.template);
  const userFunctionTemplate = isUserFunctionTemplate(draft.template);
  const exportDefaultPreview =
    draft.templateParams.length > 0
      ? `export default (${draft.templateParams.join(', ')}) => \`...\``
      : 'export default () => `...`';

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-neutral-50">{draft.name || 'Untitled prompt'}</h1>
          <p className="mt-0.5 font-mono text-xs text-neutral-500">{draft.key || 'new_prompt'}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outlined" size="sm" onClick={onDuplicate} disabled={saving}>
            Duplicate
          </Button>
          <Button variant="danger" size="sm" onClick={onDelete} disabled={saving || !draft.id}>
            Delete
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving || !dirty}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </header>

      <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-400">Name</span>
            <Input
              value={draft.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Prompt name"
              className="h-10 rounded-lg"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-400">Key</span>
            <Input
              value={draft.key}
              onChange={(e) => onChange({ key: e.target.value })}
              placeholder="snake_case_key"
              className="h-10 rounded-lg font-mono text-sm"
            />
            {saveError ? (
              <p className="text-xs text-danger">{saveError}</p>
            ) : (
              <p className="text-xs text-neutral-500">Key phải duy nhất trong cùng ngôn ngữ</p>
            )}
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-400">Language</span>
            <DropdownSelect
              value={draft.language}
              onChange={(language) => onChange({ language })}
              options={PROMPT_LANGUAGE_OPTIONS}
              className="w-full"
              triggerClassName="h-10 w-full rounded-lg"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-400">Category</span>
            <DropdownSelect
              value={draft.category}
              onChange={(category) => onChange({ category })}
              options={PROMPT_CATEGORY_OPTIONS}
              className="w-full"
              triggerClassName="h-10 w-full rounded-lg"
            />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-neutral-400">Description (optional)</span>
          <Input
            value={draft.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Short description"
            className="h-10 rounded-lg"
          />
        </label>

        <div className="card-surface space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium text-neutral-100">User Prompt Template</h3>
              <p className="text-xs text-neutral-500">
                {userFunctionTemplate ? (
                  <>Function template — variables are not used</>
                ) : (
                  <>
                    Template body saved as <code className="text-neutral-400">{exportDefaultPreview}</code>.
                    Reference params with <code className="text-neutral-400">${'{param}'}</code> in the body.
                  </>
                )}
              </p>
            </div>
            <span className="text-xs text-neutral-500">~{tokenEstimate} tokens</span>
          </div>
          <Textarea
            value={draft.template}
            onChange={(e) => onChange({ template: e.target.value })}
            rows={12}
            className="min-h-[240px] font-mono text-xs leading-relaxed"
            placeholder="Write your prompt template body..."
          />
          {!userFunctionTemplate ? (
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
                  Insert Variable
                </Button>
              </div>
              {draft.templateParams.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {draft.templateParams.map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-elevated px-2.5 py-1 font-mono text-xs text-neutral-200"
                    >
                      {name}
                      <button
                        type="button"
                        onClick={() => handleRemoveVariable(name)}
                        className="rounded-full px-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
                        aria-label={`Remove ${name}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-neutral-400">System Prompt (playground only)</span>
          <Textarea
            value={draft.systemPrompt}
            onChange={(e) => onChange({ systemPrompt: e.target.value })}
            rows={4}
            className="font-mono text-xs"
            placeholder="Optional system instructions for playground runs"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-neutral-400">Output Schema JSON (playground only)</span>
          <Textarea
            value={draft.outputSchema}
            onChange={(e) => onChange({ outputSchema: e.target.value })}
            rows={6}
            className="font-mono text-xs"
            placeholder='{"title": "string", "tags": ["string"]}'
          />
        </label>
      </div>
    </section>
  );
}
