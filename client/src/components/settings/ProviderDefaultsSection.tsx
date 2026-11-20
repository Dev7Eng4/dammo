import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchChromeProfiles } from '../../api/chromeProfiles';
import { fetchPromptSettings, updatePromptSettings } from '../../api/prompts';
import {
  IMAGE_PROVIDER_OPTIONS,
  PLAYGROUND_PROVIDER_OPTIONS,
  TEXT_LLM_OPTIONS,
  VIDEO_PROVIDER_OPTIONS,
} from '../../constants/promptForm';
import { useAbortableEffect } from '../../hooks';
import type { ChromeProfile, LlmContent } from '../../types/chromeProfile';
import type { PromptsSettings, TextLlmProvider, UpdatePromptsSettingsPayload } from '../../types/prompt';
import { DropdownSelect } from '../ui';

type ToolKey = 'defaultReferenceImageProvider' | 'defaultSceneImageProvider' | 'defaultThumbnailProvider' | 'defaultVideoProvider';

interface ToolRow {
  key: ToolKey;
  group: 'image' | 'video';
  labelKey: string;
  hintKey: string;
  options: { value: string; label: string }[];
}

const TOOL_ROWS: ToolRow[] = [
  { key: 'defaultReferenceImageProvider', group: 'image', labelKey: 'referenceImageGen', hintKey: 'referenceImageHint', options: IMAGE_PROVIDER_OPTIONS },
  { key: 'defaultSceneImageProvider', group: 'image', labelKey: 'sceneImageGen', hintKey: 'sceneImageHint', options: IMAGE_PROVIDER_OPTIONS },
  { key: 'defaultThumbnailProvider', group: 'image', labelKey: 'thumbGen', hintKey: 'thumbHint', options: IMAGE_PROVIDER_OPTIONS },
  { key: 'defaultVideoProvider', group: 'video', labelKey: 'videoGen', hintKey: 'savedVideoDefault', options: VIDEO_PROVIDER_OPTIONS },
];

type ContentTask = 'content' | 'scriptRemake' | 'scenePrompt' | 'metadata';
type LlmKey = 'defaultLlmProvider' | 'scriptRemakeLlmProvider' | 'scenePromptLlmProvider' | 'metadataLlmProvider';
type ProfileKey = 'contentChromeProfileId' | 'scriptRemakeChromeProfileId' | 'scenePromptChromeProfileId' | 'metadataChromeProfileId';

/** Text jobs that each pick their own LLM and Chrome profile. General content stays ChatGPT / Gemini. */
const CONTENT_TASKS: {
  task: ContentTask;
  llmKey: LlmKey;
  profileKey: ProfileKey;
  llmOptions: { value: TextLlmProvider; label: string }[];
}[] = [
  { task: 'content', llmKey: 'defaultLlmProvider', profileKey: 'contentChromeProfileId', llmOptions: PLAYGROUND_PROVIDER_OPTIONS },
  { task: 'scriptRemake', llmKey: 'scriptRemakeLlmProvider', profileKey: 'scriptRemakeChromeProfileId', llmOptions: TEXT_LLM_OPTIONS },
  { task: 'scenePrompt', llmKey: 'scenePromptLlmProvider', profileKey: 'scenePromptChromeProfileId', llmOptions: TEXT_LLM_OPTIONS },
  { task: 'metadata', llmKey: 'metadataLlmProvider', profileKey: 'metadataChromeProfileId', llmOptions: TEXT_LLM_OPTIONS },
];

/** Text-chat provider → the LLM ticked in a profile's LLM Content column. */
const CONTENT_LLM_FOR_PROVIDER: Record<TextLlmProvider, LlmContent> = {
  gpt: 'chatgpt',
  gemini: 'gemini',
  claude: 'claude',
};

function hasContentLlm(profile: ChromeProfile, provider: TextLlmProvider): boolean {
  return profile.llmContent?.includes(CONTENT_LLM_FOR_PROVIDER[provider]) ?? false;
}

const triggerClassName = 'h-9 w-full rounded-lg text-sm';

/**
 * Settings → AI tools: which LLM / browser tool makes text, images and video, as one card per kind.
 * Content jobs each choose an LLM and a Chrome profile (only profiles with that LLM ticked on the
 * Chrome profiles screen are offered). Used by every pipeline and the Prompt page playground; each
 * change is saved on its own, right away.
 */
export function ProviderDefaultsSection() {
  const { t } = useTranslation(['content', 'factory', 'common']);
  const [values, setValues] = useState<PromptsSettings | null>(null);
  const [profiles, setProfiles] = useState<ChromeProfile[]>([]);
  /** Row being saved: a tool key or a content task. */
  const [saving, setSaving] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  useAbortableEffect(async (signal) => {
    const [{ item }, profileList] = await Promise.all([
      fetchPromptSettings({ signal }),
      fetchChromeProfiles({ signal }).catch(() => ({ items: [] as ChromeProfile[] })),
    ]);
    setValues({ ...item, defaultThumbnailProvider: item.defaultThumbnailProvider ?? 'flow' });
    setProfiles(profileList.items);
  }, []);

  async function save(rowId: string, patch: UpdatePromptsSettingsPayload) {
    if (!values) return;
    const previous = values;
    setValues({ ...values, ...patch } as PromptsSettings);
    setErrors((prev) => ({ ...prev, [rowId]: undefined }));
    setSaving(rowId);
    try {
      const { item } = await updatePromptSettings(patch);
      setValues((current) => (current ? { ...current, ...item } : current));
    } catch (err) {
      setValues(previous);
      setErrors((prev) => ({ ...prev, [rowId]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setSaving(null);
    }
  }

  function changeTaskLlm(row: (typeof CONTENT_TASKS)[number], provider: TextLlmProvider) {
    if (!values) return;
    const chosenId = values[row.profileKey];
    const chosen = chosenId ? profiles.find((profile) => profile.id === chosenId) : undefined;
    const patch: UpdatePromptsSettingsPayload = { [row.llmKey]: provider };
    // The chosen profile isn't logged into the new LLM → back to automatic.
    if (chosenId && !(chosen && hasContentLlm(chosen, provider))) patch[row.profileKey] = null;
    void save(row.task, patch);
  }

  function profileOptions(provider: TextLlmProvider, chosenId: string | null) {
    const options = [
      { value: '', label: t('factory:settings.contentTasks.profileAuto') },
      ...profiles
        .filter((profile) => hasContentLlm(profile, provider))
        .map((profile) => ({ value: profile.id, label: profile.name })),
    ];
    if (chosenId && !options.some((option) => option.value === chosenId)) {
      options.push({ value: chosenId, label: t('factory:settings.contentTasks.profileMissing') });
    }
    return options;
  }

  function renderContentTask(row: (typeof CONTENT_TASKS)[number], current: PromptsSettings) {
    const provider = current[row.llmKey];
    const chosenId = current[row.profileKey];
    const options = profileOptions(provider, chosenId);
    const noProfile = options.length === 1;
    const labelBase = `factory:settings.contentTasks.${row.task}`;

    return (
      <div key={row.task} className="space-y-1.5">
        <span className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground/80">{t(`${labelBase}.label`)}</span>
          {saving === row.task ? (
            <span className="text-[10px] text-muted-foreground">{t('common:actions.saving')}</span>
          ) : null}
        </span>
        <div className="grid grid-cols-2 gap-2">
          <DropdownSelect
            value={provider}
            onChange={(next) => changeTaskLlm(row, next as TextLlmProvider)}
            options={row.llmOptions}
            disabled={saving !== null}
            className="w-full"
            triggerClassName={triggerClassName}
          />
          <DropdownSelect
            value={chosenId ?? ''}
            onChange={(next) => void save(row.task, { [row.profileKey]: next || null })}
            options={options}
            disabled={saving !== null}
            className="w-full"
            triggerClassName={triggerClassName}
          />
        </div>
        {errors[row.task] ? (
          <p className="text-[10px] text-danger">{errors[row.task]}</p>
        ) : noProfile ? (
          <p className="text-[10px] text-warning">{t('factory:settings.contentTasks.noProfile')}</p>
        ) : (
          <p className="text-[10px] text-muted-foreground">{t(`${labelBase}.hint`)}</p>
        )}
      </div>
    );
  }

  function renderToolRow(row: ToolRow, current: PromptsSettings) {
    return (
      <label key={row.key} className="block space-y-1.5">
        <span className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground/80">{t(`content:prompts.playground.${row.labelKey}`)}</span>
          {saving === row.key ? (
            <span className="text-[10px] text-muted-foreground">{t('common:actions.saving')}</span>
          ) : null}
        </span>
        <DropdownSelect
          value={current[row.key]}
          onChange={(next) => void save(row.key, { [row.key]: next } as UpdatePromptsSettingsPayload)}
          options={row.options}
          disabled={saving !== null}
          className="w-full"
          triggerClassName={triggerClassName}
        />
        {errors[row.key] ? (
          <p className="text-[10px] text-danger">{errors[row.key]}</p>
        ) : (
          <p className="text-[10px] text-muted-foreground">{t(`content:prompts.playground.${row.hintKey}`)}</p>
        )}
      </label>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('factory:settings.providersDesc')}</p>
      {(['content', 'image', 'video'] as const).map((group) => (
        <section key={group} className="space-y-3 rounded-lg border border-border bg-surface-elevated/50 px-4 py-3">
          <div>
            <h3 className="text-sm font-medium text-foreground">{t(`factory:settings.providerGroups.${group}.title`)}</h3>
            <p className="text-xs text-muted-foreground">{t(`factory:settings.providerGroups.${group}.desc`)}</p>
          </div>
          {values === null ? (
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {group === 'content'
                ? CONTENT_TASKS.map((row) => renderContentTask(row, values))
                : TOOL_ROWS.filter((row) => row.group === group).map((row) => renderToolRow(row, values))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
