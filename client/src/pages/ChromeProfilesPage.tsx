import { useState } from 'react';
import { fetchChromeProfiles, openChromeProfile, resetSubChromeProfiles, setMainChromeProfile, setSubChromeProfile } from '../api/chromeProfiles';
import { AddChromeProfileModal } from '../components/chrome-profiles/AddChromeProfileModal';
import { ChromeProfilesTable } from '../components/chrome-profiles/ChromeProfilesTable';
import { ChromeProfilesToolbar } from '../components/chrome-profiles/ChromeProfilesToolbar';
import { useToast } from '../components/ui';
import { useAbortableEffect } from '../hooks';
import type { ChromeProfile, ChromeProfileRole } from '../types/chromeProfile';

export function ChromeProfilesPage() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<ChromeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
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
        setError(err instanceof Error ? err.message : 'Failed to load profiles');
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
    toast.success('Chrome profile created successfully');
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
        toast.success(`"${target.name}" is now a main profile`);
      } else {
        await setSubChromeProfile(id);
        toast.success(`"${target.name}" is now a sub profile`);
      }
      handleRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile role');
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
      const deletedMessage =
        result.deletedCount > 0
          ? `Removed ${result.deletedCount} sub profile(s) and created 8 new ones.`
          : 'Created 8 new sub profiles.';
      toast.success(deletedMessage);
      handleRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset sub profiles');
    } finally {
      setResettingSub(false);
    }
  }

  async function handleOpenProfile() {
    if (!selectedId || opening) return;

    setOpening(true);
    try {
      const { item } = await openChromeProfile(selectedId);
      toast.success(`Opened Chrome profile "${item.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to open profile');
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="-m-6 flex h-[calc(100svh-3.5rem)] flex-col">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="border-b border-border pb-4">
            <ChromeProfilesToolbar
              count={profiles.length}
              loading={loading}
              opening={opening}
              settingMain={settingRole}
              resetting={resettingSub}
              canOpen={selectedId !== null}
              canSetMain={selectedProfile !== null && selectedProfile.role !== 'main'}
              onAddProfile={() => setShowAddModal(true)}
              onOpenProfile={handleOpenProfile}
              onSetMainProfile={handleSetMainProfile}
              onResetSubProfiles={handleResetSubProfiles}
              onRefresh={handleRefresh}
            />
          </div>

          {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}

          <div className="mt-4 card-surface px-5 pt-3 pb-4">
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
    </div>
  );
}
