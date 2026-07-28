import { useCallback, useMemo, useState } from 'react';
import { isAbortError } from '../api/http';
import {
  createPrompt,
  deletePrompt,
  fetchPrompts,
  fetchPromptSettings,
  resolvePromptSet,
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
  PromptCategory,
  PromptFormDraft,
  PromptLanguage,
  PromptPlaygroundResult,
  PromptSet,
  PromptSetResolved,
  PromptStepFormValues,
  VideoBrowserProvider,
} from '../types/prompt';
import {
  buildManagedTemplateExpression,
  extractTemplateVariables,
  interpolateTemplate,
  isUserFunctionTemplate,
  parseManagedTemplate,
} from '../utils/promptVariables';

function supportsReferenceImage(category: PromptCategory): boolean {
  return category === 'thumbnail' || category === 'image';
}

function supportsChannelBackgroundImage(category: PromptCategory): boolean {
  return category === 'thumbnail';
}

function createEmptyStep(order = 0): PromptStepFormValues {
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

const EMPTY_DRAFT: PromptFormDraft = {
  id: null,
  key: '',
  language: 'ja',
  name: '',
  category: 'meta',
  description: '',
  isDefault: false,
  steps: [createEmptyStep(0)],
  activeStepIndex: 0,
};

function serializeDraft(draft: PromptFormDraft): string {
  return JSON.stringify({
    language: draft.language,
    name: draft.name,
    category: draft.category,
    description: draft.description,
    isDefault: draft.isDefault,
    steps: draft.steps.map(step => ({
      id: step.id,
      order: step.order,
      name: step.name,
      outputType: step.outputType,
      useReferenceImage: step.useReferenceImage,
      useChannelBackgroundImage: step.useChannelBackgroundImage,
      templateParams: step.templateParams,
      outputSchemaText: step.outputSchemaText,
      template: step.template,
    })),
  });
}

function syncVariableValues(
  body: string,
  templateParams: string[],
  current: Record<string, string> = {},
): Record<string, string> {
  const vars = extractTemplateVariables(body, templateParams);
  return Object.fromEntries(vars.map(name => [name, current[name] ?? '']));
}

function parseOutputSchemaText(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function stepFromResolved(
  step: PromptSetResolved['stepsWithTemplates'][number],
  index: number,
): PromptStepFormValues {
  const managed = parseManagedTemplate(step.template);
  return {
    id: step.id,
    order: step.order ?? index,
    name: step.name ?? `Step ${index + 1}`,
    outputType: step.outputType ?? 'text',
    useReferenceImage: step.useReferenceImage ?? false,
    useChannelBackgroundImage: step.useChannelBackgroundImage ?? false,
    templateParams: managed?.params ?? step.templateParams ?? [],
    outputSchemaText: step.outputSchema ? JSON.stringify(step.outputSchema, null, 2) : '',
    template: managed?.body ?? step.template,
  };
}

function draftFromResolved(item: PromptSetResolved): PromptFormDraft {
  const steps =
    item.stepsWithTemplates?.length > 0
      ? item.stepsWithTemplates.map(stepFromResolved)
      : [createEmptyStep(0)];

  return {
    id: item.id,
    key: item.key,
    language: item.language,
    name: item.name,
    category: item.category,
    description: item.description ?? '',
    isDefault: item.isDefault === true,
    isSystem: item.isSystem,
    steps,
    activeStepIndex: 0,
  };
}

function buildStepsPayload(draft: PromptFormDraft) {
  return draft.steps.map((step, index) => {
    const templatePayload = isUserFunctionTemplate(step.template)
      ? step.template
      : buildManagedTemplateExpression(step.template, step.templateParams);

    return {
      id: step.id,
      order: index,
      name: step.name || undefined,
      outputType: step.outputType,
      useReferenceImage: supportsReferenceImage(draft.category) ? step.useReferenceImage : false,
      useChannelBackgroundImage: supportsChannelBackgroundImage(draft.category)
        ? step.useChannelBackgroundImage
        : false,
      templateParams: step.templateParams,
      outputSchema: parseOutputSchemaText(step.outputSchemaText),
      template: templatePayload,
    };
  });
}

export function PromptsPage() {
  const [prompts, setPrompts] = useState<PromptSet[]>([]);
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
  const [videoProvider, setVideoProvider] = useState<VideoBrowserProvider>('meta');
  const [providerSaving, setProviderSaving] = useState(false);
  const [imageProviderSaving, setImageProviderSaving] = useState(false);
  const [videoProviderSaving, setVideoProviderSaving] = useState(false);
  const [providerSettingsError, setProviderSettingsError] = useState<string | null>(null);
  const [imageProviderSettingsError, setImageProviderSettingsError] = useState<string | null>(null);
  const [videoProviderSettingsError, setVideoProviderSettingsError] = useState<string | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [playgroundResult, setPlaygroundResult] = useState<PromptPlaygroundResult | null>(null);
  const [playgroundError, setPlaygroundError] = useState<string | null>(null);

  const dirty = useMemo(() => {
    if (!draft) return false;
    return serializeDraft(draft) !== baseline;
  }, [draft, baseline]);

  const activeStep = draft?.steps[draft.activeStepIndex] ?? draft?.steps[0] ?? null;

  const refreshList = useCallback(
    async (signal?: AbortSignal) => {
      setListLoading(true);
      try {
        const filtered = await fetchPrompts(
          categoryFilter === 'all' ? undefined : categoryFilter,
          languageFilter === 'all' ? undefined : languageFilter,
          debouncedSearch,
          1,
          100,
          { signal },
        );
        setPrompts(filtered.items);
      } catch (err) {
        if (isAbortError(err)) return;
        setPrompts([]);
      } finally {
        if (!signal?.aborted) setListLoading(false);
      }
    },
    [categoryFilter, languageFilter, debouncedSearch],
  );

  useAbortableEffect(
    async signal => {
      await refreshList(signal);
    },
    [refreshList],
  );

  useAbortableEffect(async signal => {
    try {
      const { item } = await fetchPromptSettings({ signal });
      setProvider(item.defaultLlmProvider);
      setImageProvider(item.defaultImageProvider);
      setVideoProvider(item.defaultVideoProvider);
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
      setProviderSettingsError(err instanceof Error ? err.message : 'Không cập nhật được nhà cung cấp mặc định');
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
      setImageProviderSettingsError(err instanceof Error ? err.message : 'Không cập nhật được nhà cung cấp hình ảnh');
    } finally {
      setImageProviderSaving(false);
    }
  }

  async function handleVideoProviderChange(next: VideoBrowserProvider) {
    const previous = videoProvider;
    setVideoProvider(next);
    setVideoProviderSettingsError(null);
    setVideoProviderSaving(true);
    try {
      const { item } = await updatePromptSettings({ defaultVideoProvider: next });
      setVideoProvider(item.defaultVideoProvider);
    } catch (err) {
      setVideoProvider(previous);
      setVideoProviderSettingsError(err instanceof Error ? err.message : 'Không cập nhật được nhà cung cấp video');
    } finally {
      setVideoProviderSaving(false);
    }
  }

  const loadPrompt = useCallback(async (id: string, signal?: AbortSignal) => {
    setEditorLoading(true);
    setSaveError(null);
    setPlaygroundResult(null);
    setPlaygroundError(null);
    try {
      const data = await resolvePromptSet(id, { signal });
      const nextDraft = draftFromResolved(data.item);
      setDraft(nextDraft);
      setBaseline(serializeDraft(nextDraft));
      const step = nextDraft.steps[0];
      setVariableValues(syncVariableValues(step.template, step.templateParams));
    } catch (err) {
      if (isAbortError(err)) return;
      setDraft(null);
      setBaseline('');
    } finally {
      if (!signal?.aborted) setEditorLoading(false);
    }
  }, []);

  useAbortableEffect(
    async signal => {
      if (!selectedId) return;
      await loadPrompt(selectedId, signal);
    },
    [selectedId, loadPrompt],
  );

  function handleSelect(id: string) {
    setSaveError(null);
    setPlaygroundError(null);
    setPlaygroundResult(null);
    setSelectedId(id);
  }

  function handleNew() {
    setSelectedId(null);
    const empty = { ...EMPTY_DRAFT, steps: [createEmptyStep(0)] };
    setDraft(empty);
    setBaseline(serializeDraft(empty));
    setVariableValues({});
    setSaveError(null);
    setPlaygroundResult(null);
    setPlaygroundError(null);
    setEditorLoading(false);
  }

  function handleChange(patch: Partial<PromptFormDraft>) {
    if (patch.name !== undefined || patch.language !== undefined) {
      setSaveError(null);
    }
    setDraft(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };

      if (patch.steps) {
        const idx = Math.min(next.activeStepIndex, next.steps.length - 1);
        next.activeStepIndex = Math.max(0, idx);
        const step = next.steps[next.activeStepIndex];
        if (step) {
          setVariableValues(current => syncVariableValues(step.template, step.templateParams, current));
        }
      }

      if (patch.activeStepIndex !== undefined) {
        const step = next.steps[patch.activeStepIndex];
        if (step) {
          setVariableValues(current => syncVariableValues(step.template, step.templateParams, current));
        }
      }

      return next;
    });
  }

  async function handleSave() {
    if (!draft) return;
    if (!draft.id && draft.isSystem) return;

    // System set: chỉ cập nhật isDefault
    if (draft.isSystem && draft.id) {
      setSaving(true);
      setSaveError(null);
      try {
        const { item } = await updatePrompt(draft.id, { isDefault: draft.isDefault });
        const resolved = await resolvePromptSet(item.id);
        const nextDraft = draftFromResolved(resolved.item);
        setDraft(nextDraft);
        setBaseline(serializeDraft(nextDraft));
        setSelectedId(item.id);
        await refreshList();
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Lưu thất bại');
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!draft.name.trim()) {
      setSaveError('Tên là bắt buộc');
      return;
    }
    if (draft.steps.length === 0) {
      setSaveError('Cần ít nhất một step');
      return;
    }
    if (draft.steps.some(s => !s.template.trim())) {
      setSaveError('Mỗi step cần có mẫu prompt');
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const stepsPayload = buildStepsPayload(draft);
      if (draft.id) {
        if (draft.language === 'all') {
          setSaveError('Không thể đặt ngôn ngữ "Tất cả" khi sửa bộ đã có');
          setSaving(false);
          return;
        }
        const { item } = await updatePrompt(draft.id, {
          language: draft.language,
          name: draft.name.trim(),
          category: draft.category,
          description: draft.description || undefined,
          isDefault: draft.isDefault,
          steps: stepsPayload,
        });
        const resolved = await resolvePromptSet(item.id);
        const nextDraft = draftFromResolved(resolved.item);
        setDraft(nextDraft);
        setBaseline(serializeDraft(nextDraft));
        setSelectedId(item.id);
      } else {
        const { item } = await createPrompt({
          language: draft.language,
          name: draft.name.trim(),
          category: draft.category,
          description: draft.description || undefined,
          isDefault: draft.isDefault,
          steps: stepsPayload,
        });
        const resolved = await resolvePromptSet(item.id);
        const nextDraft = draftFromResolved(resolved.item);
        setDraft(nextDraft);
        setBaseline(serializeDraft(nextDraft));
        setSelectedId(item.id);
      }
      await refreshList();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  }

  function handleDuplicate() {
    if (!draft) return;
    const copy: PromptFormDraft = {
      ...draft,
      id: null,
      key: '',
      name: draft.name ? `${draft.name} (bản sao)` : 'Chưa đặt tên (bản sao)',
      isSystem: false,
      isDefault: false,
      steps: draft.steps.map((step, index) => ({
        ...step,
        id: crypto.randomUUID(),
        order: index,
      })),
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
    if (draft.isSystem) return;
    if (!window.confirm('Xóa bộ prompt này?')) return;
    try {
      await deletePrompt(draft.id);
      setSelectedId(null);
      setDraft(null);
      setBaseline('');
      await refreshList();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Xóa thất bại');
    }
  }

  async function handleRun() {
    if (!activeStep?.template.trim()) return;
    setRunning(true);
    setPlaygroundError(null);
    setPlaygroundResult(null);
    const userPrompt = interpolateTemplate(activeStep.template, variableValues);
    try {
      const { item } = await runPromptPlayground({
        outputType: activeStep.outputType,
        provider,
        imageProvider,
        videoProvider,
        userPrompt,
        promptId: draft?.id ?? undefined,
      });
      setPlaygroundResult(item);
    } catch (err) {
      setPlaygroundError(err instanceof Error ? err.message : 'Chạy thử thất bại');
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
        readOnly={draft?.isSystem}
        saveError={saveError}
        onChange={handleChange}
        onSave={handleSave}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
      />
      <PromptPlaygroundPanel
        template={activeStep?.template ?? ''}
        templateParams={activeStep?.templateParams ?? []}
        outputType={activeStep?.outputType ?? 'text'}
        provider={provider}
        imageProvider={imageProvider}
        videoProvider={videoProvider}
        providerSaving={providerSaving}
        imageProviderSaving={imageProviderSaving}
        videoProviderSaving={videoProviderSaving}
        providerSettingsError={providerSettingsError}
        imageProviderSettingsError={imageProviderSettingsError}
        videoProviderSettingsError={videoProviderSettingsError}
        variableValues={variableValues}
        running={running}
        result={playgroundResult}
        error={playgroundError}
        onProviderChange={handleProviderChange}
        onImageProviderChange={handleImageProviderChange}
        onVideoProviderChange={handleVideoProviderChange}
        onVariableChange={(name, value) => setVariableValues(prev => ({ ...prev, [name]: value }))}
        onRun={handleRun}
      />
    </div>
  );
}
