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
  PromptPlaygroundResult,
  PromptStepDraft,
  VideoBrowserProvider,
} from '../types/prompt';
import type { PromptListLanguageFilter } from '../components/prompts/PromptsListPanel';
import {
  buildManagedTemplateExpression,
  derivePromptKeyFromName,
  extractTemplateVariables,
  interpolateTemplate,
  isUserFunctionTemplate,
  parseManagedTemplate,
} from '../utils/promptVariables';
import {
  createEmptyStepDraft,
  createStepLocalId,
  getPromptSetSiblings,
  planStepKeys,
  resolveDraftBaseKey,
  resolveDraftOutputType,
  supportsChannelBackgroundImage,
  supportsReferenceImage,
} from '../utils/promptSets';

const EMPTY_DRAFT: PromptFormDraft = {
  language: 'ja',
  name: '',
  category: 'meta',
  niche: 'all',
  steps: [createEmptyStepDraft()],
};

function serializeDraft(draft: PromptFormDraft): string {
  return JSON.stringify({
    language: draft.language,
    name: draft.name,
    category: draft.category,
    niche: draft.niche,
    steps: draft.steps.map((step) => ({
      id: step.id,
      key: step.key,
      outputType: step.outputType,
      description: step.description,
      template: step.template,
      templateParams: step.templateParams,
      useReferenceImage: step.useReferenceImage,
      useChannelBackgroundImage: step.useChannelBackgroundImage,
    })),
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

function stepDraftFromResolved(item: {
  id: string;
  key: string;
  category: PromptCategory;
  outputType?: PromptFormDraft['steps'][number]['outputType'];
  description?: string;
  useReferenceImage?: boolean;
  useChannelBackgroundImage?: boolean;
  template: string;
}): PromptStepDraft {
  const outputType = resolveDraftOutputType(item);
  const managed = parseManagedTemplate(item.template);
  if (managed) {
    return {
      localId: createStepLocalId(),
      id: item.id,
      key: item.key,
      outputType,
      description: item.description ?? '',
      template: managed.body,
      templateParams: managed.params,
      useReferenceImage: item.useReferenceImage ?? false,
      useChannelBackgroundImage: item.useChannelBackgroundImage ?? false,
    };
  }

  return {
    localId: createStepLocalId(),
    id: item.id,
    key: item.key,
    outputType,
    description: item.description ?? '',
    template: item.template,
    templateParams: [],
    useReferenceImage: item.useReferenceImage ?? false,
    useChannelBackgroundImage: item.useChannelBackgroundImage ?? false,
  };
}

function buildStepTemplatePayload(step: PromptStepDraft): string {
  return isUserFunctionTemplate(step.template)
    ? step.template
    : buildManagedTemplateExpression(step.template, step.templateParams);
}

function clampStepFlags(category: PromptCategory, step: PromptStepDraft): PromptStepDraft {
  return {
    ...step,
    useReferenceImage: supportsReferenceImage(category) ? step.useReferenceImage : false,
    useChannelBackgroundImage: supportsChannelBackgroundImage(category)
      ? step.useChannelBackgroundImage
      : false,
  };
}

export function PromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [allPrompts, setAllPrompts] = useState<Prompt[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<PromptCategory | 'all'>('all');
  const [languageFilter, setLanguageFilter] = useState<PromptListLanguageFilter>('any');
  const debouncedSearch = useDebouncedValue(search, 300);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PromptFormDraft | null>(null);
  const [baseline, setBaseline] = useState('');
  const [editorLoading, setEditorLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [provider, setProvider] = useState<PlaygroundProvider>('gpt');
  const [imageProvider, setImageProvider] = useState<ImageBrowserProvider>('flow');
  const [thumbnailProvider, setThumbnailProvider] = useState<ImageBrowserProvider>('flow');
  const [videoProvider, setVideoProvider] = useState<VideoBrowserProvider>('meta');
  const [providerSaving, setProviderSaving] = useState(false);
  const [imageProviderSaving, setImageProviderSaving] = useState(false);
  const [thumbnailProviderSaving, setThumbnailProviderSaving] = useState(false);
  const [videoProviderSaving, setVideoProviderSaving] = useState(false);
  const [providerSettingsError, setProviderSettingsError] = useState<string | null>(null);
  const [imageProviderSettingsError, setImageProviderSettingsError] = useState<string | null>(null);
  const [thumbnailProviderSettingsError, setThumbnailProviderSettingsError] = useState<string | null>(null);
  const [videoProviderSettingsError, setVideoProviderSettingsError] = useState<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [variableValuesByStep, setVariableValuesByStep] = useState<Record<string, Record<string, string>>>({});
  const [running, setRunning] = useState(false);
  const [playgroundResult, setPlaygroundResult] = useState<PromptPlaygroundResult | null>(null);
  const [playgroundError, setPlaygroundError] = useState<string | null>(null);

  const dirty = useMemo(() => {
    if (!draft) return false;
    return serializeDraft(draft) !== baseline;
  }, [draft, baseline]);

  const activeStep = draft?.steps[activeStepIndex] ?? draft?.steps[0] ?? null;
  const activeStepLocalId = activeStep?.localId ?? '';
  const variableValues = variableValuesByStep[activeStepLocalId] ?? {};

  const refreshList = useCallback(async (signal?: AbortSignal) => {
    setListLoading(true);
    try {
      const [filtered, all] = await Promise.all([
        fetchPrompts(
          categoryFilter === 'all' ? undefined : categoryFilter,
          languageFilter === 'any' ? undefined : languageFilter,
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
      setThumbnailProvider(item.defaultThumbnailProvider ?? 'flow');
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

  async function handleThumbnailProviderChange(next: ImageBrowserProvider) {
    const previous = thumbnailProvider;
    setThumbnailProvider(next);
    setThumbnailProviderSettingsError(null);
    setThumbnailProviderSaving(true);

    try {
      const { item } = await updatePromptSettings({ defaultThumbnailProvider: next });
      setThumbnailProvider(item.defaultThumbnailProvider);
    } catch (err) {
      setThumbnailProvider(previous);
      setThumbnailProviderSettingsError(
        err instanceof Error ? err.message : 'Không cập nhật được nhà cung cấp thumbnail',
      );
    } finally {
      setThumbnailProviderSaving(false);
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

  const syncStepVariables = useCallback((steps: PromptStepDraft[]) => {
    setVariableValuesByStep((current) => {
      const next: Record<string, Record<string, string>> = {};
      for (const step of steps) {
        if (isUserFunctionTemplate(step.template)) {
          next[step.localId] = {};
        } else {
          next[step.localId] = syncVariableValues(
            step.template,
            step.templateParams,
            current[step.localId] ?? {},
          );
        }
      }
      return next;
    });
  }, []);

  const loadPrompt = useCallback(async (id: string, signal?: AbortSignal) => {
    const prompt = allPrompts.find((item) => item.id === id) ?? prompts.find((item) => item.id === id);
    if (!prompt) return;

    setEditorLoading(true);
    setPlaygroundResult(null);
    setPlaygroundError(null);

    try {
      const siblings = getPromptSetSiblings(prompt, allPrompts.length > 0 ? allPrompts : prompts);
      const resolved = await Promise.all(
        siblings.map((item) => resolvePrompt(item.key, item.language, { signal })),
      );
      const steps = resolved.map((data) => stepDraftFromResolved(data.item));
      const nextDraft: PromptFormDraft = {
        language: prompt.language,
        name: prompt.name,
        category: prompt.category,
        niche: prompt.niche || 'all',
        isSystem: siblings.some((item) => item.isSystem),
        steps,
      };
      setDraft(nextDraft);
      setBaseline(serializeDraft(nextDraft));
      setActiveStepIndex(0);
      syncStepVariables(steps);
    } catch (err) {
      if (isAbortError(err)) return;
      setDraft(null);
      setBaseline('');
    } finally {
      if (!signal?.aborted) setEditorLoading(false);
    }
  }, [allPrompts, prompts, syncStepVariables]);

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
    const nextDraft: PromptFormDraft = {
      ...EMPTY_DRAFT,
      steps: [createEmptyStepDraft()],
    };
    setSelectedId(null);
    setDraft(nextDraft);
    setBaseline(serializeDraft(nextDraft));
    setActiveStepIndex(0);
    setVariableValuesByStep({});
    setPlaygroundResult(null);
    setPlaygroundError(null);
    setEditorLoading(false);
  }

  function handleChange(patch: Partial<PromptFormDraft>) {
    if (patch.name !== undefined || patch.language !== undefined) {
      setSaveError(null);
    }
    setDraft((prev) => {
      if (!prev) return prev;
      const next: PromptFormDraft = { ...prev, ...patch };

      if (patch.category !== undefined) {
        next.steps = next.steps.map((step) => clampStepFlags(patch.category!, step));
      }

      return next;
    });
  }

  function handleStepChange(index: number, patch: Partial<PromptStepDraft>) {
    setDraft((prev) => {
      if (!prev) return prev;
      const steps = prev.steps.map((step, stepIndex) => {
        if (stepIndex !== index) return step;
        let nextStep = { ...step, ...patch };
        if (patch.template !== undefined && isUserFunctionTemplate(nextStep.template)) {
          nextStep.templateParams = [];
        }
        nextStep = clampStepFlags(prev.category, nextStep);
        return nextStep;
      });

      const changed = steps[index];
      if (changed && (patch.template !== undefined || patch.templateParams !== undefined)) {
        setVariableValuesByStep((current) => ({
          ...current,
          [changed.localId]: isUserFunctionTemplate(changed.template)
            ? {}
            : syncVariableValues(changed.template, changed.templateParams, current[changed.localId] ?? {}),
        }));
      }

      return { ...prev, steps };
    });
  }

  function handleAddStep() {
    setDraft((prev) => {
      if (!prev) return prev;
      const step = createEmptyStepDraft();
      const steps = [...prev.steps, step];
      setActiveStepIndex(steps.length - 1);
      setVariableValuesByStep((current) => ({ ...current, [step.localId]: {} }));
      return { ...prev, steps };
    });
  }

  function handleRemoveStep(index: number) {
    setDraft((prev) => {
      if (!prev || prev.steps.length <= 1) return prev;
      const removed = prev.steps[index];
      const steps = prev.steps.filter((_, stepIndex) => stepIndex !== index);
      setActiveStepIndex((current) => Math.min(current, steps.length - 1));
      if (removed) {
        setVariableValuesByStep((current) => {
          const next = { ...current };
          delete next[removed.localId];
          return next;
        });
      }
      return { ...prev, steps };
    });
  }

  function handleActiveStepChange(index: number) {
    setActiveStepIndex(index);
    setPlaygroundResult(null);
    setPlaygroundError(null);
  }

  async function persistPromptSetForLanguage(
    currentDraft: PromptFormDraft,
    targetLanguage: PromptLanguage,
    options?: {
      existingSteps?: PromptStepDraft[];
      deleteRemoved?: boolean;
    },
  ): Promise<PromptStepDraft[]> {
    const name = currentDraft.name.trim();
    const existingSteps = options?.existingSteps ?? [];
    const hasExisting = existingSteps.some((step) => step.id);
    const baseKey = hasExisting
      ? resolveDraftBaseKey({ ...currentDraft, steps: existingSteps })
      : derivePromptKeyFromName(name);
    const plannedKeys = planStepKeys(baseKey, currentDraft.steps.length);
    const previousIds = new Set(existingSteps.map((step) => step.id).filter(Boolean) as string[]);
    // When expanding single-step → multi-step, bare key (e.g. metadata_drama) must be
    // deleted even if it is missing/mis-indexed in the draft's existingSteps.
    const oldSingleKeyIds =
      currentDraft.steps.length > 1
        ? [
            ...new Set(
              [
                ...existingSteps
                  .filter(
                    (step) =>
                      step.id && step.key && !/_step_\d+$/.test(step.key) && step.key === baseKey,
                  )
                  .map((step) => step.id as string),
                ...allPrompts
                  .filter(
                    (item) =>
                      item.language === targetLanguage &&
                      item.name.trim().toLowerCase() === name.toLowerCase() &&
                      item.key === baseKey &&
                      !/_step_\d+$/.test(item.key),
                  )
                  .map((item) => item.id),
              ].filter(Boolean),
            ),
          ]
        : [];

    const nextSteps: PromptStepDraft[] = [];

    for (let index = 0; index < currentDraft.steps.length; index += 1) {
      const sourceStep = clampStepFlags(currentDraft.category, currentDraft.steps[index]!);
      const existingStep = existingSteps[index];
      const key = plannedKeys[index]!;
      const templatePayload = buildStepTemplatePayload(sourceStep);
      const useReferenceImage = supportsReferenceImage(currentDraft.category) ? sourceStep.useReferenceImage : false;
      const useChannelBackgroundImage = supportsChannelBackgroundImage(currentDraft.category)
        ? sourceStep.useChannelBackgroundImage
        : false;

      const canUpdateInPlace =
        Boolean(existingStep?.id) &&
        existingStep.key === key &&
        !oldSingleKeyIds.includes(existingStep.id!);

      if (canUpdateInPlace && existingStep?.id) {
        const { item } = await updatePrompt(existingStep.id, {
          language: targetLanguage,
          name,
          category: currentDraft.category,
          niche: currentDraft.niche || 'all',
          outputType: sourceStep.outputType,
          description: sourceStep.description || undefined,
          template: templatePayload,
          useReferenceImage,
          useChannelBackgroundImage,
        });
        nextSteps.push({
          ...sourceStep,
          localId: existingStep.localId,
          id: item.id,
          key: item.key,
          useReferenceImage: item.useReferenceImage ?? false,
          useChannelBackgroundImage: item.useChannelBackgroundImage ?? false,
        });
        previousIds.delete(item.id);
      } else {
        const { item } = await createPrompt({
          language: targetLanguage,
          name,
          category: currentDraft.category,
          niche: currentDraft.niche || 'all',
          outputType: sourceStep.outputType,
          description: sourceStep.description || undefined,
          template: templatePayload,
          key,
          useReferenceImage,
          useChannelBackgroundImage,
        });
        nextSteps.push({
          ...sourceStep,
          localId: existingStep?.localId ?? sourceStep.localId,
          id: item.id,
          key: item.key,
          useReferenceImage: item.useReferenceImage ?? false,
          useChannelBackgroundImage: item.useChannelBackgroundImage ?? false,
        });
      }
    }

    if (options?.deleteRemoved !== false) {
      for (const id of [...previousIds, ...oldSingleKeyIds]) {
        if (nextSteps.some((step) => step.id === id)) continue;
        try {
          await deletePrompt(id);
        } catch {
          // may already be gone
        }
      }
    }

    return nextSteps;
  }

  async function handleSave() {
    if (!draft) return;
    if (draft.isSystem) return;
    if (!draft.name.trim()) {
      setSaveError('Tên là bắt buộc');
      return;
    }
    if (draft.steps.some((step) => !step.template.trim())) {
      setSaveError('Mỗi step cần có mẫu prompt');
      return;
    }

    const isExisting = draft.steps.some((step) => step.id);
    const name = draft.name.trim();
    const savedLanguage = draft.language;

    setSaving(true);
    setSaveError(null);
    try {
      const nextSteps = await persistPromptSetForLanguage(draft, draft.language, {
        existingSteps: isExisting ? draft.steps : [],
        deleteRemoved: true,
      });

      const finalizedDraft: PromptFormDraft = {
        language: savedLanguage,
        name,
        category: draft.category,
        niche: draft.niche || 'all',
        isSystem: false,
        steps: nextSteps,
      };

      setDraft(finalizedDraft);
      setBaseline(serializeDraft(finalizedDraft));
      setSelectedId(nextSteps[0]?.id ?? null);
      setActiveStepIndex(0);
      syncStepVariables(nextSteps);
      await refreshList();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lưu thất bại';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }

  function handleDuplicate() {
    if (!draft) return;
    const copyName = draft.name ? `${draft.name} (bản sao)` : 'Chưa đặt tên (bản sao)';
    const copy: PromptFormDraft = {
      language: draft.language,
      name: copyName,
      category: draft.category,
      niche: draft.niche || 'all',
      isSystem: false,
      steps: draft.steps.map((step) => ({
        ...step,
        localId: createStepLocalId(),
        id: null,
        key: '',
      })),
    };
    setSelectedId(null);
    setDraft(copy);
    setBaseline(serializeDraft(copy));
    setActiveStepIndex(0);
    syncStepVariables(copy.steps);
    setSaveError(null);
    setPlaygroundResult(null);
    setPlaygroundError(null);
  }

  async function handleDelete() {
    if (!draft) return;
    if (draft.isSystem) return;
    const ids = draft.steps.map((step) => step.id).filter(Boolean) as string[];
    if (ids.length === 0) return;
    const label = draft.steps.length > 1 ? `bộ ${draft.steps.length} step này` : 'prompt này';
    if (!window.confirm(`Xóa ${label}?`)) return;

    try {
      for (const id of ids) {
        await deletePrompt(id);
      }
      setSelectedId(null);
      setDraft(null);
      setBaseline('');
      setVariableValuesByStep({});
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
        promptId: activeStep.id ?? undefined,
      });
      setPlaygroundResult(item);
    } catch (err) {
      setPlaygroundError(err instanceof Error ? err.message : 'Chạy thử thất bại');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="-m-6 flex h-svh overflow-hidden">
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
        onStepChange={handleStepChange}
        onAddStep={handleAddStep}
        onRemoveStep={handleRemoveStep}
        onSave={handleSave}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
      />
      <PromptPlaygroundPanel
        template={activeStep?.template ?? ''}
        templateParams={activeStep?.templateParams ?? []}
        outputType={activeStep?.outputType ?? 'text'}
        stepCount={draft?.steps.length ?? 0}
        activeStepIndex={activeStepIndex}
        onActiveStepChange={handleActiveStepChange}
        provider={provider}
        imageProvider={imageProvider}
        thumbnailProvider={thumbnailProvider}
        videoProvider={videoProvider}
        providerSaving={providerSaving}
        imageProviderSaving={imageProviderSaving}
        thumbnailProviderSaving={thumbnailProviderSaving}
        videoProviderSaving={videoProviderSaving}
        providerSettingsError={providerSettingsError}
        imageProviderSettingsError={imageProviderSettingsError}
        thumbnailProviderSettingsError={thumbnailProviderSettingsError}
        videoProviderSettingsError={videoProviderSettingsError}
        variableValues={variableValues}
        running={running}
        result={playgroundResult}
        error={playgroundError}
        onProviderChange={handleProviderChange}
        onImageProviderChange={handleImageProviderChange}
        onThumbnailProviderChange={handleThumbnailProviderChange}
        onVideoProviderChange={handleVideoProviderChange}
        onVariableChange={(name, value) => {
          if (!activeStepLocalId) return;
          setVariableValuesByStep((prev) => ({
            ...prev,
            [activeStepLocalId]: { ...(prev[activeStepLocalId] ?? {}), [name]: value },
          }));
        }}
        onRun={handleRun}
      />
    </div>
  );
}
