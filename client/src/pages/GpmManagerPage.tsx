import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  deleteGpmGroup,
  deleteGpmProfile,
  fetchGpmGroups,
  fetchGpmProfiles,
  startGpmProfile,
  stopGpmProfile,
  testGpmProfile,
} from '../api/gpm';
import { setProfileProxy } from '../api/proxies';
import { AddGpmProfileModal } from '../components/gpm-manager/AddGpmProfileModal';
import { AddGpmGroupModal } from '../components/gpm-manager/AddGpmGroupModal';
import { EditGpmGroupModal } from '../components/gpm-manager/EditGpmGroupModal';
import { EditGpmProfileModal } from '../components/gpm-manager/EditGpmProfileModal';
import { GpmGroupsTable } from '../components/gpm-manager/GpmGroupsTable';
import { GpmGroupsToolbar } from '../components/gpm-manager/GpmGroupsToolbar';
import { GpmProfilesTable } from '../components/gpm-manager/GpmProfilesTable';
import { GpmProfilesToolbar } from '../components/gpm-manager/GpmProfilesToolbar';
import { PageHeader, PageShell } from '../components/layout';
import { Button, Modal, PageTabs, useToast } from '../components/ui';
import { useAbortableEffect } from '../hooks';
import { UserPlus } from 'lucide-react';
import type {
  GpmGroup,
  GpmProfile,
  GpmProfileSort,
  GpmTestResult,
} from '../types/gpm';

type GpmTab = 'profiles' | 'groups';

export function GpmManagerPage() {
  const { t } = useTranslation(['browser', 'common']);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<GpmTab>('profiles');
  const [refreshKey, setRefreshKey] = useState(0);

  const [profiles, setProfiles] = useState<GpmProfile[]>([]);
  const [groups, setGroups] = useState<GpmGroup[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  const [profileSearch, setProfileSearch] = useState('');
  const [profileSort, setProfileSort] = useState<GpmProfileSort>(0);
  const [debouncedProfileSearch, setDebouncedProfileSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [runningProfileIds, setRunningProfileIds] = useState<Set<string>>(() => new Set());

  const [showAddProfileModal, setShowAddProfileModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showDeleteProfileModal, setShowDeleteProfileModal] = useState(false);
  const [deleteHardMode, setDeleteHardMode] = useState(true);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [showDeleteGroupModal, setShowDeleteGroupModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GpmGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);

  const [actionBusyIds, setActionBusyIds] = useState<Set<string>>(() => new Set());
  const [testing, setTesting] = useState(false);
  const [deletingProfile, setDeletingProfile] = useState(false);
  const [testResult, setTestResult] = useState<GpmTestResult | null>(null);
  const [showTestResultModal, setShowTestResultModal] = useState(false);

  const selectedProfileId =
    selectedIds.size === 1 ? (Array.from(selectedIds)[0] ?? null) : null;
  const selectedProfile = selectedProfileId
    ? (profiles.find((profile) => profile.id === selectedProfileId) ?? null)
    : null;

  const usedEmails = useMemo(
    () => Array.from(new Set(profiles.map((profile) => profile.name.trim().toLowerCase()).filter(Boolean))),
    [profiles],
  );

  const filteredGroups = useMemo(() => {
    const query = groupSearch.trim().toLowerCase();
    if (!query) return groups;
    return groups.filter((group) => group.name.toLowerCase().includes(query));
  }, [groups, groupSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedProfileSearch(profileSearch.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [profileSearch]);

  useAbortableEffect(
    async (signal) => {
      setProfilesLoading(true);
      setProfilesError(null);
      try {
        const { item } = await fetchGpmProfiles(
          {
            page: 1,
            page_size: 100,
            search: debouncedProfileSearch || undefined,
            sort: profileSort,
          },
          { signal },
        );
        setProfiles(item.data);
        setSelectedIds((current) => {
          const next = new Set<string>();
          for (const id of current) {
            if (item.data.some((profile) => profile.id === id)) next.add(id);
          }
          return next;
        });
      } catch (err) {
        if (signal.aborted) return;
        setProfiles([]);
        setProfilesError(err instanceof Error ? err.message : t('gpm.toast.profilesLoadError'));
      } finally {
        if (!signal.aborted) setProfilesLoading(false);
      }
    },
    [refreshKey, debouncedProfileSearch, profileSort],
  );

  useAbortableEffect(
    async (signal) => {
      setGroupsLoading(true);
      setGroupsError(null);
      try {
        const { item } = await fetchGpmGroups(undefined, { signal });
        setGroups(item.data);
      } catch (err) {
        if (signal.aborted) return;
        setGroups([]);
        setGroupsError(err instanceof Error ? err.message : t('gpm.toast.groupsLoadError'));
      } finally {
        if (!signal.aborted) setGroupsLoading(false);
      }
    },
    [refreshKey],
  );

  const handleRefresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  function handleToggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleToggleAll() {
    setSelectedIds((prev) => {
      if (prev.size === profiles.length) return new Set();
      return new Set(profiles.map((profile) => profile.id));
    });
  }

  async function startProfileById(id: string) {
    const profile = profiles.find((item) => item.id === id);
    const { item } = await startGpmProfile(id);
    setRunningProfileIds((prev) => new Set(prev).add(id));
    const name = profile?.name ?? id;
    const debugInfo =
      item.remote_debugging_address ??
      (item.remote_debugging_port ? `127.0.0.1:${item.remote_debugging_port}` : null);
    toast.success(
      debugInfo
        ? t('gpm.toast.startedDebug', { name, debug: debugInfo })
        : t('gpm.toast.started', { name }),
    );
  }

  async function stopProfileById(id: string) {
    const profile = profiles.find((item) => item.id === id);
    await stopGpmProfile(id);
    setRunningProfileIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    toast.success(t('gpm.toast.stopped', { name: profile?.name ?? id }));
  }

  async function handleStartRow(id: string) {
    if (actionBusyIds.has(id)) return;
    setActionBusyIds((prev) => new Set(prev).add(id));
    try {
      await startProfileById(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('gpm.toast.startError'));
    } finally {
      setActionBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleStopRow(id: string) {
    if (actionBusyIds.has(id)) return;
    setActionBusyIds((prev) => new Set(prev).add(id));
    try {
      await stopProfileById(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('gpm.toast.stopError'));
    } finally {
      setActionBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleTestProfile() {
    if (!selectedProfileId || testing) return;
    setTesting(true);
    try {
      const { item } = await testGpmProfile(selectedProfileId);
      setRunningProfileIds((prev) => new Set(prev).add(selectedProfileId));
      setTestResult(item);
      setShowTestResultModal(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('gpm.toast.testError'));
    } finally {
      setTesting(false);
    }
  }

  async function handleConfirmDeleteProfile() {
    if (!selectedProfileId || deletingProfile) return;
    setDeletingProfile(true);
    try {
      await deleteGpmProfile(selectedProfileId, deleteHardMode ? 'hard' : 'soft');
      await setProfileProxy(selectedProfileId, null).catch(() => {
        /* best-effort unassign */
      });
      setRunningProfileIds((prev) => {
        const next = new Set(prev);
        next.delete(selectedProfileId);
        return next;
      });
      toast.success(
        deleteHardMode
          ? t('gpm.toast.deletedHard', { name: selectedProfile?.name ?? selectedProfileId })
          : t('gpm.toast.deleted', { name: selectedProfile?.name ?? selectedProfileId }),
      );
      setShowDeleteProfileModal(false);
      setDeleteHardMode(true);
      setSelectedIds(new Set());
      handleRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('gpm.toast.deleteError'));
    } finally {
      setDeletingProfile(false);
    }
  }

  function handleEditGroup(group: GpmGroup) {
    setSelectedGroup(group);
    setShowEditGroupModal(true);
  }

  function handleDeleteGroup(group: GpmGroup) {
    setSelectedGroup(group);
    setShowDeleteGroupModal(true);
  }

  async function handleConfirmDeleteGroup() {
    if (!selectedGroup || deletingGroup) return;
    setDeletingGroup(true);
    try {
      await deleteGpmGroup(selectedGroup.id);
      toast.success(t('gpm.toast.groupDeleted', { name: selectedGroup.name }));
      setShowDeleteGroupModal(false);
      setSelectedGroup(null);
      handleRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('gpm.toast.groupDeleteError'));
    } finally {
      setDeletingGroup(false);
    }
  }

  return (
    <PageShell fullBleed>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="mb-4 shrink-0 space-y-4">
          <PageHeader title={t('gpm.page.title')} subtitle={t('gpm.page.subtitle')} icon={UserPlus} />
          <PageTabs
            variant="pill"
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as 'profiles' | 'groups')}
            items={[
              { id: 'profiles', label: t('gpm.tab.profiles') },
              { id: 'groups', label: t('gpm.tab.groups') },
            ]}
          />
        </div>

        {activeTab === 'profiles' ? (
          <>
            <div className="shrink-0 border-b border-border pb-4">
              <GpmProfilesToolbar
                count={profiles.length}
                search={profileSearch}
                sort={profileSort}
                loading={profilesLoading}
                testing={testing}
                deleting={deletingProfile}
                canTest={selectedProfileId !== null}
                canEdit={selectedProfileId !== null}
                canDelete={selectedProfileId !== null}
                onSearchChange={setProfileSearch}
                onSortChange={setProfileSort}
                onRefresh={handleRefresh}
                onAddProfile={() => setShowAddProfileModal(true)}
                onTest={handleTestProfile}
                onEdit={() => setShowEditProfileModal(true)}
                onDelete={() => setShowDeleteProfileModal(true)}
              />
            </div>

            {profilesError ? <p className="mt-2 shrink-0 text-xs text-danger">{profilesError}</p> : null}

            <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden card-surface px-5 pt-3 pb-4">
              <div className="min-h-0 flex-1 overflow-auto">
                <GpmProfilesTable
                  profiles={profiles}
                  groups={groups}
                  selectedIds={selectedIds}
                  runningProfileIds={runningProfileIds}
                  actionBusyIds={actionBusyIds}
                  loading={profilesLoading}
                  onToggleRow={handleToggleRow}
                  onToggleAll={handleToggleAll}
                  onStart={handleStartRow}
                  onStop={handleStopRow}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="shrink-0 border-b border-border pb-4">
              <GpmGroupsToolbar
                count={filteredGroups.length}
                search={groupSearch}
                loading={groupsLoading}
                onSearchChange={setGroupSearch}
                onRefresh={handleRefresh}
                onAddGroup={() => setShowAddGroupModal(true)}
              />
            </div>

            {groupsError ? <p className="mt-2 shrink-0 text-xs text-danger">{groupsError}</p> : null}

            <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden card-surface px-5 pt-3 pb-4">
              <div className="min-h-0 flex-1 overflow-auto">
                <GpmGroupsTable
                  groups={filteredGroups}
                  loading={groupsLoading}
                  readOnly={false}
                  deletingId={deletingGroup ? selectedGroup?.id ?? null : null}
                  onEdit={handleEditGroup}
                  onDelete={handleDeleteGroup}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <AddGpmProfileModal
        open={showAddProfileModal}
        groups={groups}
        usedEmails={usedEmails}
        onClose={() => setShowAddProfileModal(false)}
        onSuccess={() => {
          toast.success(t('gpm.toast.created'));
          handleRefresh();
        }}
      />

      <AddGpmGroupModal
        open={showAddGroupModal}
        onClose={() => setShowAddGroupModal(false)}
        onSuccess={() => {
          toast.success(t('gpm.toast.groupCreated'));
          handleRefresh();
        }}
      />

      <EditGpmGroupModal
        open={showEditGroupModal}
        group={selectedGroup}
        onClose={() => {
          setShowEditGroupModal(false);
          setSelectedGroup(null);
        }}
        onSuccess={() => {
          toast.success(t('gpm.toast.groupUpdated'));
          handleRefresh();
        }}
      />

      <EditGpmProfileModal
        open={showEditProfileModal}
        profile={selectedProfile}
        groups={groups}
        usedEmails={usedEmails}
        onClose={() => setShowEditProfileModal(false)}
        onSuccess={() => {
          toast.success(t('gpm.toast.updated'));
          handleRefresh();
        }}
      />

      <Modal
        open={showTestResultModal}
        onClose={() => {
          setShowTestResultModal(false);
          setTestResult(null);
        }}
        title={t('gpm.test.title')}
        footer={
          <Button
            size="sm"
            className="rounded-lg"
            onClick={() => {
              setShowTestResultModal(false);
              setTestResult(null);
            }}
          >
            {t('common:actions.close')}
          </Button>
        }
      >
        {testResult ? (
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{t('gpm.test.profile')}</p>
              <p className="mt-1 text-neutral-200">{selectedProfile?.name ?? testResult.profileId}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{t('gpm.test.prompt')}</p>
              <p className="mt-1 text-neutral-300">{testResult.prompt}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{t('gpm.test.response')}</p>
              <pre className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-elevated p-3 text-neutral-200">
                {testResult.content || t('gpm.test.emptyResponse')}
              </pre>
            </div>
            <p className="text-xs text-neutral-500">
              {t('gpm.test.done', { seconds: (testResult.elapsedMs / 1000).toFixed(1) })}
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={showDeleteProfileModal}
        onClose={() => {
          if (deletingProfile) return;
          setShowDeleteProfileModal(false);
          setDeleteHardMode(true);
        }}
        title={t('gpm.deleteProfile.title')}
        footer={
          <>
            <Button
              variant="outlined"
              size="sm"
              className="rounded-lg"
              onClick={() => {
                setShowDeleteProfileModal(false);
                setDeleteHardMode(true);
              }}
              disabled={deletingProfile}
            >
              {t('common:actions.cancel')}
            </Button>
            <Button
              size="sm"
              className="rounded-lg"
              onClick={handleConfirmDeleteProfile}
              disabled={deletingProfile}
            >
              {deletingProfile
                ? t('common:actions.deleting')
                : deleteHardMode
                  ? t('gpm.deleteProfile.hard')
                  : t('common:actions.delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-300">
          {t('gpm.deleteProfile.body', { name: selectedProfile?.name ?? selectedProfileId })}
        </p>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
          <input
            type="checkbox"
            checked={deleteHardMode}
            onChange={(e) => setDeleteHardMode(e.target.checked)}
            disabled={deletingProfile}
            className="size-3.5 rounded border-border bg-surface accent-primary-500"
          />
          {t('gpm.deleteProfile.hardLabel')}
        </label>
        <p className="mt-2 text-xs text-neutral-500">{t('gpm.deleteProfile.softHint')}</p>
      </Modal>

      <Modal
        open={showDeleteGroupModal}
        onClose={() => {
          if (deletingGroup) return;
          setShowDeleteGroupModal(false);
          setSelectedGroup(null);
        }}
        title={t('gpm.deleteGroup.title')}
        footer={
          <>
            <Button
              variant="outlined"
              size="sm"
              className="rounded-lg"
              onClick={() => {
                setShowDeleteGroupModal(false);
                setSelectedGroup(null);
              }}
              disabled={deletingGroup}
            >
              {t('common:actions.cancel')}
            </Button>
            <Button
              size="sm"
              className="rounded-lg"
              onClick={handleConfirmDeleteGroup}
              disabled={deletingGroup}
            >
              {deletingGroup ? t('common:actions.deleting') : t('common:actions.delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-300">
          {t('gpm.deleteGroup.body', { name: selectedGroup?.name })}
        </p>
      </Modal>
    </PageShell>
  );
}
