import { Button, DropdownSelect, Input } from '../ui';
import { PLAYGROUND_PROVIDER_OPTIONS } from '../../constants/promptForm';
import {
  extractTemplateVariables,
  formatVariableToken,
  isUserFunctionTemplate,
} from '../../utils/promptVariables';
import type { PlaygroundProvider, PromptPlaygroundResult } from '../../types/prompt';

export interface PromptPlaygroundPanelProps {
  template: string;
  templateParams: string[];
  provider: PlaygroundProvider;
  providerSaving?: boolean;
  providerSettingsError?: string | null;
  variableValues: Record<string, string>;
  running: boolean;
  result: PromptPlaygroundResult | null;
  error: string | null;
  onProviderChange: (provider: PlaygroundProvider) => void;
  onVariableChange: (name: string, value: string) => void;
  onRun: () => void;
}

export function PromptPlaygroundPanel({
  template,
  templateParams,
  provider,
  providerSaving = false,
  providerSettingsError = null,
  variableValues,
  running,
  result,
  error,
  onProviderChange,
  onVariableChange,
  onRun,
}: PromptPlaygroundPanelProps) {
  const userFunctionTemplate = isUserFunctionTemplate(template);
  const variables = extractTemplateVariables(template, templateParams);

  let formattedContent = result?.content ?? '';
  if (result?.content) {
    try {
      formattedContent = JSON.stringify(JSON.parse(result.content), null, 2);
    } catch {
      formattedContent = result.content;
    }
  }

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-border bg-surface">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-semibold text-neutral-100">Playground</h2>
        <p className="mt-0.5 text-xs text-neutral-500">Test prompt via browser automation</p>
      </div>

      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
        <label className="block space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Default LLM Provider</span>
            {providerSaving ? <span className="text-[10px] text-neutral-500">Saving...</span> : null}
          </div>
          <DropdownSelect
            value={provider}
            onChange={onProviderChange}
            options={PLAYGROUND_PROVIDER_OPTIONS}
            disabled={providerSaving}
            className="w-full"
            triggerClassName="h-9 w-full rounded-lg text-sm"
          />
          {providerSettingsError ? (
            <p className="text-[10px] text-danger">{providerSettingsError}</p>
          ) : (
            <p className="text-[10px] text-neutral-500">Used as default for Run Test and saved on change.</p>
          )}
        </label>

        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-400">Variables</p>
          {userFunctionTemplate ? (
            <p className="text-xs text-neutral-500">Function template — no variables</p>
          ) : variables.length === 0 ? (
            <p className="text-xs text-neutral-500">No variables in template</p>
          ) : (
            <div className="space-y-2">
              {variables.map((name) => (
                <label key={name} className="block space-y-1">
                  <span className="font-mono text-[10px] text-neutral-500">
                    {templateParams.includes(name) ? `\${${name}}` : formatVariableToken(name, template)}
                  </span>
                  <Input
                    value={variableValues[name] ?? ''}
                    onChange={(e) => onVariableChange(name, e.target.value)}
                    placeholder={`Value for ${name}`}
                    className="h-9 rounded-lg text-xs"
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        <Button className="w-full" onClick={onRun} disabled={running || !template.trim()}>
          {running ? 'Running...' : 'Run Test'}
        </Button>

        {error ? (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        ) : null}

        {result ? (
          <div className="card-surface space-y-3 p-3">
            <div className="flex flex-wrap gap-2 text-[10px] text-neutral-500">
              <span>{result.provider}</span>
              <span>·</span>
              <span>{result.elapsedMs}ms</span>
              {result.profileId ? (
                <>
                  <span>·</span>
                  <span>profile {result.profileId.slice(0, 8)}</span>
                </>
              ) : null}
              {result.model ? (
                <>
                  <span>·</span>
                  <span>{result.model}</span>
                </>
              ) : null}
              {result.usage ? (
                <>
                  <span>·</span>
                  <span>{result.usage.totalTokens} tokens</span>
                </>
              ) : null}
            </div>
            <pre className="scrollbar-thin max-h-[320px] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-neutral-200">
              {formattedContent}
            </pre>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
