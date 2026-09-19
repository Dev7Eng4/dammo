import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchChromeProfiles, openChromeProfile, resetSubChromeProfiles, setMainChromeProfile, setSubChromeProfile } from '../api/chromeProfiles';
import { PageHeader, PageShell } from '../components/layout';
import { AddChromeProfileModal } from '../components/chrome-profiles/AddChromeProfileModal';
import { ChromeProfilesTable } from '../components/chrome-profiles/ChromeProfilesTable';
import { ChromeProfilesToolbar } from '../components/chrome-profiles/ChromeProfilesToolbar';
import { EditChromeProfileModal } from '../components/chrome-profiles/EditChromeProfileModal';
import { useToast } from '../components/ui';
import { useAbortableEffect } from '../hooks';
import type { ChromeProfile, ChromeProfileRole } from '../types/chromeProfile';
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
  const [settingRole, setSettingRole] = useState(false);
  const [resettingSub, setResettingSub] = useState(false);

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

  async function handleRoleChange(id: string, role: ChromeProfileRole) {
    if (settingRole) return;

    const target = profiles.find((profile) => profile.id === id);
    if (!target || target.role === role) return;

    setSettingRole(true);
    try {
      if (role === 'main') {
        await setMainChromeProfile(id);
        toast.success(t('chrome.toast.setMain', { name: target.name }));
      } else {
        await setSubChromeProfile(id);
        toast.success(t('chrome.toast.setSecondary', { name: target.name }));
      }
      handleRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('chrome.toast.roleError'));
    } finally {
      setSettingRole(false);
    }
  }

  async function handleSetMainProfile() {
    if (!selectedId) return;
    await handleRoleChange(selectedId, 'main');
  }

  async function handleResetSubProfiles() {
    if (resettingSub) return;

    setResettingSub(true);
    setSelectedId((current) => {
      const selected = profiles.find((profile) => profile.id === current);
      return selected?.role === 'sub' ? null : current;
    });

    try {
      const result = await resetSubChromeProfiles();
      toast.success(
        result.deletedCount > 0
          ? t('chrome.toast.resetDone', { count: result.deletedCount })
          : t('chrome.toast.resetCreatedOnly'),
      );
      handleRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('chrome.toast.resetError'));
    } finally {
      setResettingSub(false);
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
              settingMain={settingRole}
              resetting={resettingSub}
              canOpen={selectedId !== null}
              canEdit={selectedId !== null}
              canSetMain={selectedProfile !== null && selectedProfile.role !== 'main'}
              onAddProfile={() => setShowAddModal(true)}
              onEditProfile={() => setShowEditModal(true)}
              onOpenProfile={handleOpenProfile}
              onSetMainProfile={handleSetMainProfile}
              onResetSubProfiles={handleResetSubProfiles}
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
              settingRole={settingRole}
              onSelect={setSelectedId}
              onRoleChange={handleRoleChange}
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
