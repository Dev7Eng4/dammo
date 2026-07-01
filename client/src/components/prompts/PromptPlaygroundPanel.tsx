import { Button, DropdownSelect, Input } from '../ui';
import { IMAGE_PROVIDER_OPTIONS, PLAYGROUND_PROVIDER_OPTIONS, VIDEO_PROVIDER_OPTIONS } from '../../constants/promptForm';
import {
  extractTemplateVariables,
  formatVariableToken,
  isUserFunctionTemplate,
} from '../../utils/promptVariables';
import type {
  ImageBrowserProvider,
  PlaygroundProvider,
  PromptOutputType,
  PromptPlaygroundResult,
  VideoBrowserProvider,
} from '../../types/prompt';

export interface PromptPlaygroundPanelProps {
  template: string;
  templateParams: string[];
  outputType: PromptOutputType;
  provider: PlaygroundProvider;
  imageProvider: ImageBrowserProvider;
  videoProvider: VideoBrowserProvider;
  providerSaving?: boolean;
  imageProviderSaving?: boolean;
  videoProviderSaving?: boolean;
  providerSettingsError?: string | null;
  imageProviderSettingsError?: string | null;
  videoProviderSettingsError?: string | null;
  variableValues: Record<string, string>;
  running: boolean;
  result: PromptPlaygroundResult | null;
  error: string | null;
  onProviderChange: (provider: PlaygroundProvider) => void;
  onImageProviderChange: (provider: ImageBrowserProvider) => void;
  onVideoProviderChange: (provider: VideoBrowserProvider) => void;
  onVariableChange: (name: string, value: string) => void;
  onRun: () => void;
}

export function PromptPlaygroundPanel({
  template,
  templateParams,
  outputType,
  provider,
  imageProvider,
  videoProvider,
  providerSaving = false,
  imageProviderSaving = false,
  videoProviderSaving = false,
  providerSettingsError = null,
  imageProviderSettingsError = null,
  videoProviderSettingsError = null,
  variableValues,
  running,
  result,
  error,
  onProviderChange,
  onImageProviderChange,
  onVideoProviderChange,
  onVariableChange,
  onRun,
}: PromptPlaygroundPanelProps) {
  const userFunctionTemplate = isUserFunctionTemplate(template);
  const variables = extractTemplateVariables(template, templateParams);
  const isImagePrompt = outputType === 'image';
  const isVideoPrompt = outputType === 'video';
  const isTextPrompt = outputType === 'text';

  let formattedContent = result?.content ?? '';
  if (result?.kind === 'text' && result.content) {
    try {
      formattedContent = JSON.stringify(JSON.parse(result.content), null, 2);
    } catch {
      formattedContent = result.content;
    }
  }

  const imagePreviewUrl =
    result?.kind === 'image' && result.imageBase64
      ? `data:${result.imageMimeType ?? 'image/jpeg'};base64,${result.imageBase64}`
      : null;

  const videoPreviewUrl =
    result?.kind === 'video' && result.videoBase64
      ? `data:${result.videoMimeType ?? 'video/mp4'};base64,${result.videoBase64}`
      : null;

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
          {isTextPrompt ? (
            <p className="text-[10px] text-primary-400">Used for this prompt.</p>
          ) : (
            <p className="text-[10px] text-neutral-500">Not used for this prompt type.</p>
          )}
          {providerSettingsError ? (
            <p className="text-[10px] text-danger">{providerSettingsError}</p>
          ) : (
            <p className="text-[10px] text-neutral-500">Saved as default for text content prompts.</p>
          )}
        </label>

        <label className="block space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Default Image Provider</span>
            {imageProviderSaving ? <span className="text-[10px] text-neutral-500">Saving...</span> : null}
          </div>
          <DropdownSelect
            value={imageProvider}
            onChange={onImageProviderChange}
            options={IMAGE_PROVIDER_OPTIONS}
            disabled={imageProviderSaving}
            className="w-full"
            triggerClassName="h-9 w-full rounded-lg text-sm"
          />
          {isImagePrompt ? (
            <p className="text-[10px] text-primary-400">Used for this prompt.</p>
          ) : (
            <p className="text-[10px] text-neutral-500">Not used for this prompt type.</p>
          )}
          {imageProviderSettingsError ? (
            <p className="text-[10px] text-danger">{imageProviderSettingsError}</p>
          ) : (
            <p className="text-[10px] text-neutral-500">Saved as default for image generation prompts.</p>
          )}
        </label>

        <label className="block space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Default Video Provider</span>
            {videoProviderSaving ? <span className="text-[10px] text-neutral-500">Saving...</span> : null}
          </div>
          <DropdownSelect
            value={videoProvider}
            onChange={onVideoProviderChange}
            options={VIDEO_PROVIDER_OPTIONS}
            disabled={videoProviderSaving}
            className="w-full"
            triggerClassName="h-9 w-full rounded-lg text-sm"
          />
          {isVideoPrompt ? (
            <p className="text-[10px] text-primary-400">Used for this prompt.</p>
          ) : (
            <p className="text-[10px] text-neutral-500">Not used for this prompt type.</p>
          )}
          {videoProviderSettingsError ? (
            <p className="text-[10px] text-danger">{videoProviderSettingsError}</p>
          ) : (
            <p className="text-[10px] text-neutral-500">Saved as default for video generation prompts.</p>
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
              <span>{result.kind}</span>
              <span>·</span>
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
            {imagePreviewUrl ? (
              <img
                src={imagePreviewUrl}
                alt="Generated thumbnail preview"
                className="max-h-[320px] w-full rounded-lg border border-border object-contain"
              />
            ) : videoPreviewUrl ? (
              <video
                src={videoPreviewUrl}
                controls
                className="max-h-[320px] w-full rounded-lg border border-border"
              />
            ) : (
              <pre className="scrollbar-thin max-h-[320px] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-neutral-200">
                {formattedContent}
              </pre>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
