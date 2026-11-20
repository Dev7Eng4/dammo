import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchChromeProfiles,
  openChromeProfile,
  updateChromeProfileLlms,
} from '../api/chromeProfiles';
import { PageHeader, PageShell } from '../components/layout';
import { AddChromeProfileModal } from '../components/chrome-profiles/AddChromeProfileModal';
import { ChromeProfilesTable } from '../components/chrome-profiles/ChromeProfilesTable';
import { ChromeProfilesToolbar } from '../components/chrome-profiles/ChromeProfilesToolbar';
import { EditChromeProfileModal } from '../components/chrome-profiles/EditChromeProfileModal';
import { useToast } from '../components/ui';
import { useAbortableEffect } from '../hooks';
import type { ChromeProfile, ChromeProfileLlmField } from '../types/chromeProfile';
import { Globe } from 'lucide-react';

export function ChromeProfilesPage() {
  const { t } = useTranslation('browser');
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<ChromeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  /** Latest LLM save request per profile, so stale responses don't overwrite newer picks. */
  const llmRequestSeq = useRef(new Map<string, number>());

  const selectedProfile = profiles.find((profile) => profile.id === selectedId) ?? null;

  useAbortableEffect(
    async (signal) => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchChromeProfiles({ signal });
        setProfiles(data.items);
        setSelectedId((current) =>
          current && data.items.some((profile) => profile.id === current) ? current : null,
        );
      } catch (err) {
        if (signal.aborted) return;
        setProfiles([]);
        setError(err instanceof Error ? err.message : t('chrome.toast.loadError'));
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [refreshKey],
  );

  function handleRefresh() {
    setRefreshKey((key) => key + 1);
  }

  function handleAddSuccess() {
    toast.success(t('chrome.toast.created'));
    handleRefresh();
  }

  function handleEditSuccess() {
    toast.success(t('chrome.toast.renamed'));
    handleRefresh();
  }

  async function handleLlmChange(id: string, field: ChromeProfileLlmField, value: string[]) {
    const target = profiles.find((profile) => profile.id === id);
    if (!target) return;

    const applyItem = (item: ChromeProfile) =>
      setProfiles((current) => current.map((profile) => (profile.id === id ? item : profile)));
    const seq = (llmRequestSeq.current.get(id) ?? 0) + 1;
    llmRequestSeq.current.set(id, seq);
    const isLatest = () => llmRequestSeq.current.get(id) === seq;

    // Optimistic update; roll back on failure.
    applyItem({ ...target, [field]: value } as ChromeProfile);

    try {
      const { item } = await updateChromeProfileLlms(id, { [field]: value });
      if (isLatest()) applyItem(item);
    } catch (err) {
      if (isLatest()) applyItem(target);
      toast.error(err instanceof Error ? err.message : t('chrome.toast.llmError'));
    }
  }

  async function handleOpenProfile() {
    if (!selectedId || opening) return;

    setOpening(true);
    try {
      const { item } = await openChromeProfile(selectedId);
      toast.success(t('chrome.toast.opened', { name: item.name }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('chrome.toast.openError'));
    } finally {
      setOpening(false);
    }
  }

  return (
    <PageShell fullBleed>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0">
          <PageHeader
            title={t('chrome.page.title')}
            subtitle={t('chrome.page.subtitle')}
            icon={Globe}
            className="mb-4"
          />
          <div className="border-b border-border pb-4">
            <ChromeProfilesToolbar
              count={profiles.length}
              loading={loading}
              opening={opening}
              canOpen={selectedId !== null}
              canEdit={selectedId !== null}
              onAddProfile={() => setShowAddModal(true)}
              onEditProfile={() => setShowEditModal(true)}
              onOpenProfile={handleOpenProfile}
            />
          </div>
          {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden card-surface px-5 pt-3 pb-4">
          <div className="min-h-0 flex-1 overflow-auto">
            <ChromeProfilesTable
              profiles={profiles}
              selectedId={selectedId}
              loading={loading}
              onSelect={setSelectedId}
              onLlmChange={handleLlmChange}
            />
          </div>
        </div>
      </div>

      <AddChromeProfileModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddSuccess}
      />

      <EditChromeProfileModal
        open={showEditModal}
        profile={selectedProfile}
        onClose={() => setShowEditModal(false)}
        onSuccess={handleEditSuccess}
      />
    </PageShell>
  );
}
