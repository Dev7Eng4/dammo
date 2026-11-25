import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
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
  stepCount: number;
  activeStepIndex: number;
  onActiveStepChange: (index: number) => void;
  /** Saved defaults the run uses; they are changed in Settings → Chrome. */
  provider: PlaygroundProvider;
  sceneImageProvider: ImageBrowserProvider;
  videoProvider: VideoBrowserProvider;
  variableValues: Record<string, string>;
  running: boolean;
  result: PromptPlaygroundResult | null;
  error: string | null;
  onVariableChange: (name: string, value: string) => void;
  onRun: () => void;
}

export function PromptPlaygroundPanel({
  template,
  templateParams,
  stepCount,
  activeStepIndex,
  onActiveStepChange,
  provider,
  sceneImageProvider,
  videoProvider,
  variableValues,
  running,
  result,
  error,
  onVariableChange,
  onRun,
}: PromptPlaygroundPanelProps) {
  const { t } = useTranslation(['content', 'common']);
  const userFunctionTemplate = isUserFunctionTemplate(template);
  const variables = extractTemplateVariables(template, templateParams);
  const stepOptions = Array.from({ length: Math.max(stepCount, 1) }, (_, index) => ({
    value: String(index),
    label: t('prompts.playground.stepLabel', { n: index + 1 }),
  }));

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
        <h2 className="text-sm font-semibold text-neutral-100">{t('prompts.playground.title')}</h2>
        <p className="mt-0.5 text-xs text-neutral-500">{t('prompts.playground.subtitle')}</p>
      </div>

      <div className="space-y-1 border-b border-border p-4 text-xs">
        <p className="font-medium text-neutral-300">{t('prompts.playground.providers')}</p>
        <p className="text-neutral-400">
          {PLAYGROUND_PROVIDER_OPTIONS.find((option) => option.value === provider)?.label ?? provider} · {IMAGE_PROVIDER_OPTIONS.find((option) => option.value === sceneImageProvider)?.label ?? sceneImageProvider} · {VIDEO_PROVIDER_OPTIONS.find((option) => option.value === videoProvider)?.label ?? videoProvider}
        </p>
        <p className="text-[10px] text-neutral-500">
          {t('prompts.playground.providersMoved')}{' '}
          <Link to="/settings?tab=ai-tools" className="text-secondary-400 hover:text-secondary-300">
            {t('prompts.playground.openSettings')}
          </Link>
        </p>
      </div>

      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
        {stepCount > 1 ? (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-400">{t('prompts.playground.step')}</span>
            <DropdownSelect
              value={String(activeStepIndex)}
              onChange={(value) => onActiveStepChange(Number(value))}
              options={stepOptions}
              className="w-full"
              triggerClassName="h-9 w-full rounded-lg text-sm"
            />
          </label>
        ) : null}

        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-400">{t('prompts.playground.variables')}</p>
            {userFunctionTemplate ? (
              <p className="text-xs text-neutral-500">{t('prompts.playground.functionNoVars')}</p>
            ) : variables.length === 0 ? (
              <p className="text-xs text-neutral-500">{t('prompts.playground.noVars')}</p>
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
                      placeholder={t('prompts.playground.valueFor', { name })}
                      className="h-9 rounded-lg text-xs"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>

          <Button className="w-full" onClick={onRun} disabled={running || !template.trim()}>
            {running ? t('prompts.playground.running') : t('prompts.playground.run')}
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
                    <span>{t('prompts.playground.profileShort', { id: result.profileId.slice(0, 8) })}</span>
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
                    <span>{t('prompts.tokens', { count: result.usage.totalTokens })}</span>
                  </>
                ) : null}
              </div>
              {imagePreviewUrl ? (
                <img
                  src={imagePreviewUrl}
                  alt={t('prompts.playground.imageAlt')}
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
      </div>
    </aside>
  );
}
