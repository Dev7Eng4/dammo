import { useCallback, useMemo, useState } from 'react';
import { isAbortError } from '../api/http';
import {
  createPrompt,
  deletePrompt,
  fetchPrompts,
  fetchPromptSettings,
  resolvePrompt,
  runPromptPlayground,
  updatePrompt,
  updatePromptSettings,
} from '../api/prompts';
import { PromptEditorPanel } from '../components/prompts/PromptEditorPanel';
import { PromptPlaygroundPanel } from '../components/prompts/PromptPlaygroundPanel';
import { PromptsListPanel } from '../components/prompts/PromptsListPanel';
import { useAbortableEffect, useDebouncedValue } from '../hooks';
import type {
  ImageBrowserProvider,
  PlaygroundProvider,
  Prompt,
  PromptCategory,
  PromptFormDraft,
  PromptLanguage,
  PromptOutputType,
  PromptPlaygroundResult,
} from '../types/prompt';
import {
  buildManagedTemplateExpression,
  extractTemplateVariables,
  findPromptKeyConflict,
  interpolateTemplate,
  isUserFunctionTemplate,
  parseManagedTemplate,
  suggestUniquePromptKey,
} from '../utils/promptVariables';

const EMPTY_DRAFT: PromptFormDraft = {
  id: null,
  key: '',
  language: 'ja',
  name: '',
  category: 'meta',
  outputType: 'text',
  description: '',
  template: '',
  templateParams: [],
  systemPrompt: '',
  outputSchema: '',
};

function resolveDraftOutputType(item: {
  outputType?: PromptOutputType;
  category: PromptCategory;
  key: string;
}): PromptOutputType {
  if (item.outputType === 'text' || item.outputType === 'image') return item.outputType;
  if (item.category === 'image' || item.key === 'love_story') return 'image';
  return 'text';
}

function serializeDraft(draft: PromptFormDraft): string {
  return JSON.stringify({
    key: draft.key,
    language: draft.language,
    name: draft.name,
    category: draft.category,
    outputType: draft.outputType,
    description: draft.description,
    template: draft.template,
    templateParams: draft.templateParams,
  });
}

function syncVariableValues(
  body: string,
  templateParams: string[],
  current: Record<string, string> = {},
): Record<string, string> {
  const vars = extractTemplateVariables(body, templateParams);
  return Object.fromEntries(vars.map((name) => [name, current[name] ?? '']));
}

function draftFromResolved(item: {
  id: string;
  key: string;
  language: PromptLanguage;
  name: string;
  category: PromptCategory;
  outputType?: PromptOutputType;
  description?: string;
  template: string;
}): PromptFormDraft {
  const outputType = resolveDraftOutputType(item);
  const managed = parseManagedTemplate(item.template);
  if (managed) {
    return {
      id: item.id,
      key: item.key,
      language: item.language,
      name: item.name,
      category: item.category,
      outputType,
      description: item.description ?? '',
      template: managed.body,
      templateParams: managed.params,
      systemPrompt: '',
      outputSchema: '',
    };
  }

  return {
    id: item.id,
    key: item.key,
    language: item.language,
    name: item.name,
    category: item.category,
    outputType,
    description: item.description ?? '',
    template: item.template,
    templateParams: [],
    systemPrompt: '',
    outputSchema: '',
  };
}

export function PromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [allPrompts, setAllPrompts] = useState<Prompt[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<PromptCategory | 'all'>('all');
  const [languageFilter, setLanguageFilter] = useState<PromptLanguage | 'all'>('all');
  const debouncedSearch = useDebouncedValue(search, 300);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PromptFormDraft | null>(null);
  const [baseline, setBaseline] = useState('');
  const [editorLoading, setEditorLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [provider, setProvider] = useState<PlaygroundProvider>('gpt');
  const [imageProvider, setImageProvider] = useState<ImageBrowserProvider>('flow');
  const [providerSaving, setProviderSaving] = useState(false);
  const [imageProviderSaving, setImageProviderSaving] = useState(false);
  const [providerSettingsError, setProviderSettingsError] = useState<string | null>(null);
  const [imageProviderSettingsError, setImageProviderSettingsError] = useState<string | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [playgroundResult, setPlaygroundResult] = useState<PromptPlaygroundResult | null>(null);
  const [playgroundError, setPlaygroundError] = useState<string | null>(null);

  const dirty = useMemo(() => {
    if (!draft) return false;
    return serializeDraft(draft) !== baseline;
  }, [draft, baseline]);

  const refreshList = useCallback(async (signal?: AbortSignal) => {
    setListLoading(true);
    try {
      const [filtered, all] = await Promise.all([
        fetchPrompts(
          categoryFilter === 'all' ? undefined : categoryFilter,
          languageFilter === 'all' ? undefined : languageFilter,
          debouncedSearch,
          1,
          100,
          { signal },
        ),
        fetchPrompts(undefined, undefined, '', 1, 100, { signal }),
      ]);
      setPrompts(filtered.items);
      setAllPrompts(all.items);
    } catch (err) {
      if (isAbortError(err)) return;
      setPrompts([]);
      setAllPrompts([]);
    } finally {
      if (!signal?.aborted) setListLoading(false);
    }
  }, [categoryFilter, languageFilter, debouncedSearch]);

  useAbortableEffect(
    async (signal) => {
      await refreshList(signal);
    },
    [refreshList],
  );

  useAbortableEffect(async (signal) => {
    try {
      const { item } = await fetchPromptSettings({ signal });
      setProvider(item.defaultLlmProvider);
      setImageProvider(item.defaultImageProvider);
    } catch (err) {
      if (isAbortError(err)) return;
    }
  }, []);

  async function handleProviderChange(next: PlaygroundProvider) {
    const previous = provider;
    setProvider(next);
    setProviderSettingsError(null);
    setProviderSaving(true);

    try {
      const { item } = await updatePromptSettings({ defaultLlmProvider: next });
      setProvider(item.defaultLlmProvider);
    } catch (err) {
      setProvider(previous);
      setProviderSettingsError(err instanceof Error ? err.message : 'Failed to update default provider');
    } finally {
      setProviderSaving(false);
    }
  }

  async function handleImageProviderChange(next: ImageBrowserProvider) {
    const previous = imageProvider;
    setImageProvider(next);
    setImageProviderSettingsError(null);
    setImageProviderSaving(true);

    try {
      const { item } = await updatePromptSettings({ defaultImageProvider: next });
      setImageProvider(item.defaultImageProvider);
    } catch (err) {
      setImageProvider(previous);
      setImageProviderSettingsError(err instanceof Error ? err.message : 'Failed to update image provider');
    } finally {
      setImageProviderSaving(false);
    }
  }

  const loadPrompt = useCallback(async (id: string, signal?: AbortSignal) => {
    const prompt = prompts.find((item) => item.id === id);
    if (!prompt) return;

    setEditorLoading(true);
    setPlaygroundResult(null);
    setPlaygroundError(null);

    try {
      const data = await resolvePrompt(prompt.key, prompt.language, { signal });
      const nextDraft = draftFromResolved(data.item);
      setDraft(nextDraft);
      setBaseline(serializeDraft(nextDraft));
      setVariableValues(syncVariableValues(nextDraft.template, nextDraft.templateParams));
    } catch (err) {
      if (isAbortError(err)) return;
      setDraft(null);
      setBaseline('');
    } finally {
      if (!signal?.aborted) setEditorLoading(false);
    }
  }, [prompts]);

  useAbortableEffect(
    async (signal) => {
      if (!selectedId) return;
      await loadPrompt(selectedId, signal);
    },
    [selectedId, loadPrompt],
  );

  function handleSelect(id: string) {
    setSelectedId(id);
  }

  function handleNew() {
    setSelectedId(null);
    setDraft({ ...EMPTY_DRAFT });
    setBaseline(serializeDraft(EMPTY_DRAFT));
    setVariableValues({});
    setPlaygroundResult(null);
    setPlaygroundError(null);
    setEditorLoading(false);
  }

  function handleChange(patch: Partial<PromptFormDraft>) {
    if (patch.key !== undefined || patch.language !== undefined) {
      setSaveError(null);
    }
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };

      if (patch.template !== undefined && isUserFunctionTemplate(next.template)) {
        next.templateParams = [];
      }

      if (patch.template !== undefined || patch.templateParams !== undefined) {
        if (isUserFunctionTemplate(next.template)) {
          setVariableValues({});
        } else {
          setVariableValues((current) =>
            syncVariableValues(next.template, next.templateParams, current),
          );
        }
      }

      return next;
    });
  }

  async function handleSave() {
    if (!draft) return;

    const conflict = findPromptKeyConflict(allPrompts, draft.key, draft.language, draft.id);
    if (conflict) {
      setSaveError(`Key "${draft.key.trim().toLowerCase()}" đã tồn tại cho ngôn ngữ ${draft.language.toUpperCase()}`);
      return;
    }

    const templatePayload = isUserFunctionTemplate(draft.template)
      ? draft.template
      : buildManagedTemplateExpression(draft.template, draft.templateParams);

    setSaving(true);
    setSaveError(null);
    try {
      if (draft.id) {
        const { item } = await updatePrompt(draft.id, {
          key: draft.key,
          language: draft.language,
          name: draft.name,
          category: draft.category,
          outputType: draft.outputType,
          description: draft.description || undefined,
          template: templatePayload,
        });
        const nextDraft = { ...draft, id: item.id, key: item.key, language: item.language };
        setDraft(nextDraft);
        setBaseline(serializeDraft(nextDraft));
        setSelectedId(item.id);
      } else {
        const { item } = await createPrompt({
          key: draft.key,
          language: draft.language,
          name: draft.name,
          category: draft.category,
          outputType: draft.outputType,
          description: draft.description || undefined,
          template: templatePayload,
        });
        const nextDraft = { ...draft, id: item.id, key: item.key, language: item.language };
        setDraft(nextDraft);
        setBaseline(serializeDraft(nextDraft));
        setSelectedId(item.id);
      }
      await refreshList();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }

  function handleDuplicate() {
    if (!draft) return;
    const copyKey = suggestUniquePromptKey(draft.key || 'new_prompt', draft.language, allPrompts);
    const copy: PromptFormDraft = {
      ...draft,
      id: null,
      key: copyKey,
      name: draft.name ? `${draft.name} (copy)` : 'Untitled (copy)',
      systemPrompt: draft.systemPrompt,
      outputSchema: draft.outputSchema,
    };
    setSelectedId(null);
    setDraft(copy);
    setBaseline(serializeDraft(copy));
    setSaveError(null);
    setPlaygroundResult(null);
    setPlaygroundError(null);
  }

  async function handleDelete() {
    if (!draft?.id) return;
    if (!window.confirm('Delete this prompt?')) return;

    try {
      await deletePrompt(draft.id);
      setSelectedId(null);
      setDraft(null);
      setBaseline('');
      await refreshList();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function handleRun() {
    if (!draft?.template.trim()) return;

    setRunning(true);
    setPlaygroundError(null);
    setPlaygroundResult(null);

    const userPrompt = interpolateTemplate(draft.template, variableValues);

    try {
      const { item } = await runPromptPlayground({
        outputType: draft.outputType,
        provider,
        imageProvider,
        userPrompt,
        promptId: draft.id ?? undefined,
      });
      setPlaygroundResult(item);
    } catch (err) {
      setPlaygroundError(err instanceof Error ? err.message : 'Playground run failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="-m-6 flex h-[calc(100svh-3.5rem)] overflow-hidden">
      <PromptsListPanel
        prompts={prompts}
        loading={listLoading}
        selectedId={selectedId}
        search={search}
        categoryFilter={categoryFilter}
        languageFilter={languageFilter}
        onSearchChange={setSearch}
        onCategoryFilterChange={setCategoryFilter}
        onLanguageFilterChange={setLanguageFilter}
        onSelect={handleSelect}
        onNew={handleNew}
      />
      <PromptEditorPanel
        draft={draft}
        loading={editorLoading}
        saving={saving}
        dirty={dirty}
        saveError={saveError}
        onChange={handleChange}
        onSave={handleSave}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
      />
      <PromptPlaygroundPanel
        template={draft?.template ?? ''}
        templateParams={draft?.templateParams ?? []}
        outputType={draft?.outputType ?? 'text'}
        provider={provider}
        imageProvider={imageProvider}
        providerSaving={providerSaving}
        imageProviderSaving={imageProviderSaving}
        providerSettingsError={providerSettingsError}
        imageProviderSettingsError={imageProviderSettingsError}
        variableValues={variableValues}
        running={running}
        result={playgroundResult}
        error={playgroundError}
        onProviderChange={handleProviderChange}
        onImageProviderChange={handleImageProviderChange}
        onVariableChange={(name, value) =>
          setVariableValues((prev) => ({ ...prev, [name]: value }))
        }
        onRun={handleRun}
      />
    </div>
  );
}
