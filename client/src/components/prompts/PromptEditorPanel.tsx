import { useState } from 'react';
import { Button, DropdownSelect, Input, Textarea } from '../ui';
import {
  PROMPT_CATEGORY_OPTIONS,
  PROMPT_LANGUAGE_OPTIONS,
  PROMPT_OUTPUT_TYPE_OPTIONS,
} from '../../constants/promptForm';
import {
  estimateTokens,
  derivePromptKeyFromName,
  isUserFunctionTemplate,
  normalizeVariableName,
} from '../../utils/promptVariables';
import type { PromptFormDraft } from '../../types/prompt';

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
      {optional ? <span className="text-neutral-500"> (optional)</span> : null}
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
  onSave,
  onDuplicate,
  onDelete,
}: PromptEditorPanelProps) {
  const [insertVarName, setInsertVarName] = useState('');

  function handleInsertVariable() {
    if (!draft || readOnly) return;
    const name = normalizeVariableName(insertVarName);
    if (!name || draft.templateParams.includes(name)) return;

    onChange({ templateParams: [...draft.templateParams, name] });
    setInsertVarName('');
  }

  function handleRemoveVariable(name: string) {
    if (!draft || readOnly) return;
    onChange({ templateParams: draft.templateParams.filter((param) => param !== name) });
  }

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
        <p className="mt-4 text-sm font-medium text-neutral-200">Select a prompt from the list</p>
        <p className="mt-1 text-xs text-neutral-500">
          Or click <span className="font-medium text-neutral-400">+ New</span> to create one
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
  const tokenEstimate = estimateTokens(draft.template);
  const userFunctionTemplate = isUserFunctionTemplate(draft.template);
  const displayKey = draft.id ? draft.key : derivePromptKeyFromName(draft.name);
  const showReferenceImageOption = draft.category === 'thumbnail' || draft.category === 'image';
  const exportDefaultPreview =
    draft.templateParams.length > 0
      ? `export default (${draft.templateParams.join(', ')}) => \`...\``
      : 'export default () => `...`';
  const headerTitle = isNew ? 'New prompt' : draft.name || 'Untitled prompt';

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-semibold text-neutral-50">{headerTitle}</h1>
            {isNew ? (
              <span className="inline-flex rounded-full border border-primary-400/30 bg-primary-400/10 px-2 py-0.5 text-[10px] font-medium text-primary-300">
                Draft
              </span>
            ) : (
              <span className="inline-flex rounded-full border border-border bg-surface-elevated px-2 py-0.5 font-mono text-[10px] text-neutral-400">
                {displayKey}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outlined" size="sm" onClick={onDuplicate} disabled={saving}>
            Duplicate
          </Button>
          {!readOnly ? (
            <>
              <Button variant="danger" size="sm" onClick={onDelete} disabled={saving || !draft.id}>
                Delete
              </Button>
              <Button size="sm" onClick={onSave} disabled={saving || !dirty || !draft.name.trim()}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : null}
        </div>
      </header>

      {readOnly ? (
        <div className="border-b border-l-2 border-warning/50 bg-warning/5 px-6 py-2">
          <p className="text-xs text-warning">System prompt — read only</p>
        </div>
      ) : null}

      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-6">
        <div className="card-surface space-y-4 rounded-xl p-4">
          <h2 className="text-sm font-medium text-neutral-100">General</h2>

          <label className="block space-y-1.5">
            <FieldLabel>Name</FieldLabel>
            <Input
              value={draft.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Prompt name"
              className="h-10 rounded-lg"
              readOnly={readOnly}
              disabled={readOnly}
              required
            />
            {saveError ? (
              <p className="text-xs text-danger">{saveError}</p>
            ) : isNew ? (
              <p className="text-xs text-neutral-500">
                Will be saved as <span className="font-mono text-neutral-400">{displayKey}</span>
              </p>
            ) : null}
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block space-y-1.5">
              <FieldLabel>Language</FieldLabel>
              <DropdownSelect
                value={draft.language}
                onChange={(language) => onChange({ language })}
                options={PROMPT_LANGUAGE_OPTIONS}
                disabled={readOnly}
                className="w-full"
                triggerClassName="h-10 w-full rounded-lg"
              />
            </label>
            <label className="block space-y-1.5">
              <FieldLabel>Category</FieldLabel>
              <DropdownSelect
                value={draft.category}
                onChange={(category) => onChange({ category })}
                options={PROMPT_CATEGORY_OPTIONS}
                disabled={readOnly}
                className="w-full"
                triggerClassName="h-10 w-full rounded-lg"
              />
            </label>
            <label className="block space-y-1.5">
              <FieldLabel>Type</FieldLabel>
              <DropdownSelect
                value={draft.outputType}
                onChange={(outputType) => onChange({ outputType })}
                options={PROMPT_OUTPUT_TYPE_OPTIONS}
                disabled={readOnly}
                className="w-full"
                triggerClassName="h-10 w-full rounded-lg"
              />
            </label>
          </div>
          <p className="text-[10px] text-neutral-500">
            Text → LLM · Image → Flow/Meta · Video → Meta AI
          </p>

          {showReferenceImageOption ? (
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface-elevated/50 px-3 py-2.5">
              <div>
                <p className="text-xs font-medium text-neutral-300">Use reference image</p>
                <p className="text-[10px] text-neutral-500">Attach a reference image when generating</p>
              </div>
              <input
                type="checkbox"
                checked={draft.useReferenceImage}
                onChange={(e) => onChange({ useReferenceImage: e.target.checked })}
                disabled={readOnly}
                className="size-3.5 shrink-0 rounded border-border bg-surface accent-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          ) : null}

          <label className="block space-y-1.5">
            <FieldLabel optional>Description</FieldLabel>
            <Input
              value={draft.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="Short description"
              className="h-10 rounded-lg"
              readOnly={readOnly}
              disabled={readOnly}
            />
          </label>
        </div>

        <div className="card-surface space-y-3 rounded-xl p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium text-neutral-100">User Prompt Template</h2>
              <p className="mt-0.5 text-xs text-neutral-500">
                {userFunctionTemplate ? (
                  <>Function template — variables are not used</>
                ) : (
                  <>
                    Saved as <code className="text-neutral-400">{exportDefaultPreview}</code> · use{' '}
                    <code className="text-neutral-400">${'{param}'}</code> in body
                  </>
                )}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-[10px] text-neutral-500">
              ~{tokenEstimate} tokens
            </span>
          </div>
          <Textarea
            value={draft.template}
            onChange={(e) => onChange({ template: e.target.value })}
            rows={12}
            className="min-h-[240px] font-mono text-xs leading-relaxed"
            placeholder="Write your prompt template body..."
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
          ) : !userFunctionTemplate && readOnly && draft.templateParams.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {draft.templateParams.map((name) => (
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
    </section>
  );
}
