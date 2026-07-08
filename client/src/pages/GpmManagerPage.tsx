import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteGpmProfile,
  fetchGpmGroups,
  fetchGpmProfiles,
  fetchGpmStatus,
  startGpmProfile,
  stopGpmProfile,
  testGpmProfile,
} from '../api/gpm';
import { setProfileProxy } from '../api/proxies';
import { AddGpmProfileModal } from '../components/gpm-manager/AddGpmProfileModal';
import { EditGpmProfileModal } from '../components/gpm-manager/EditGpmProfileModal';
import { GpmConnectionBanner } from '../components/gpm-manager/GpmConnectionBanner';
import { GpmGroupsTable } from '../components/gpm-manager/GpmGroupsTable';
import { GpmGroupsToolbar } from '../components/gpm-manager/GpmGroupsToolbar';
import { GpmProfilesTable } from '../components/gpm-manager/GpmProfilesTable';
import { GpmProfilesToolbar } from '../components/gpm-manager/GpmProfilesToolbar';
import { Button, Modal, useToast } from '../components/ui';
import { useAbortableEffect } from '../hooks';
import { cn } from '../lib/cn';
import type {
  GpmConnectionStatus,
  GpmGroup,
  GpmProfile,
  GpmProfileSort,
  GpmTestResult,
} from '../types/gpm';

type GpmTab = 'profiles' | 'groups';

export function GpmManagerPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<GpmTab>('profiles');
  const [refreshKey, setRefreshKey] = useState(0);

  const [status, setStatus] = useState<GpmConnectionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

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

  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [runningProfileIds, setRunningProfileIds] = useState<Set<string>>(() => new Set());

  const [showAddProfileModal, setShowAddProfileModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showDeleteProfileModal, setShowDeleteProfileModal] = useState(false);
  const [deleteHardMode, setDeleteHardMode] = useState(false);

  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deletingProfile, setDeletingProfile] = useState(false);
  const [testResult, setTestResult] = useState<GpmTestResult | null>(null);
  const [showTestResultModal, setShowTestResultModal] = useState(false);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const isSelectedRunning = selectedProfileId ? runningProfileIds.has(selectedProfileId) : false;

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
      setStatusLoading(true);
      try {
        const { item } = await fetchGpmStatus({ signal });
        setStatus(item);
      } catch (err) {
        if (signal.aborted) return;
        setStatus({
          connected: false,
          baseUrl: 'http://127.0.0.1:19995/api/v3',
          message: err instanceof Error ? err.message : 'Failed to check GPM status',
        });
      } finally {
        if (!signal.aborted) setStatusLoading(false);
      }
    },
    [refreshKey],
  );

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
        setSelectedProfileId((current) =>
          current && item.data.some((profile) => profile.id === current) ? current : null,
        );
      } catch (err) {
        if (signal.aborted) return;
        setProfiles([]);
        setProfilesError(err instanceof Error ? err.message : 'Failed to load profiles');
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
        setGroupsError(err instanceof Error ? err.message : 'Failed to load groups');
      } finally {
        if (!signal.aborted) setGroupsLoading(false);
      }
    },
    [refreshKey],
  );

  const handleRefresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  async function handleStartProfile() {
    if (!selectedProfileId || starting) return;
    setStarting(true);
    try {
      const { item } = await startGpmProfile(selectedProfileId);
      setRunningProfileIds((prev) => new Set(prev).add(selectedProfileId));
      const name = selectedProfile?.name ?? selectedProfileId;
      const debugInfo =
        item.remote_debugging_address ??
        (item.remote_debugging_port ? `127.0.0.1:${item.remote_debugging_port}` : null);
      toast.success(
        debugInfo ? `Started "${name}" — debug ${debugInfo}` : `Started profile "${name}"`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start profile');
    } finally {
      setStarting(false);
    }
  }

  async function handleStopProfile() {
    if (!selectedProfileId || stopping) return;
    setStopping(true);
    try {
      await stopGpmProfile(selectedProfileId);
      setRunningProfileIds((prev) => {
        const next = new Set(prev);
        next.delete(selectedProfileId);
        return next;
      });
      toast.success(`Stopped profile "${selectedProfile?.name ?? selectedProfileId}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to stop profile');
    } finally {
      setStopping(false);
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
      toast.error(err instanceof Error ? err.message : 'Gemini test failed');
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
          ? `Permanently deleted "${selectedProfile?.name ?? selectedProfileId}"`
          : `Deleted "${selectedProfile?.name ?? selectedProfileId}"`,
      );
      setShowDeleteProfileModal(false);
      setDeleteHardMode(false);
      setSelectedProfileId(null);
      handleRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete profile');
    } finally {
      setDeletingProfile(false);
    }
  }

  return (
    <div className="-m-6 flex h-[calc(100svh-3.5rem)] flex-col">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <GpmConnectionBanner status={status} loading={statusLoading} className="mb-4" />

          <div className="mb-4 flex gap-1 border-b border-border">
            {(['profiles', 'groups'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'border-b-2 px-4 py-2 text-sm font-medium capitalize transition-colors',
                  activeTab === tab
                    ? 'border-primary-400 text-primary-400'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200',
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'profiles' ? (
            <>
              <div className="border-b border-border pb-4">
                <GpmProfilesToolbar
                  count={profiles.length}
                  search={profileSearch}
                  sort={profileSort}
                  loading={profilesLoading}
                  starting={starting}
                  stopping={stopping}
                  testing={testing}
                  deleting={deletingProfile}
                  canStart={selectedProfileId !== null && !isSelectedRunning}
                  canStop={selectedProfileId !== null && isSelectedRunning}
                  canTest={selectedProfileId !== null}
                  canEdit={selectedProfileId !== null}
                  canDelete={selectedProfileId !== null}
                  onSearchChange={setProfileSearch}
                  onSortChange={setProfileSort}
                  onRefresh={handleRefresh}
                  onAddProfile={() => setShowAddProfileModal(true)}
                  onStart={handleStartProfile}
                  onStop={handleStopProfile}
                  onTest={handleTestProfile}
                  onEdit={() => setShowEditProfileModal(true)}
                  onDelete={() => setShowDeleteProfileModal(true)}
                />
              </div>

              {profilesError ? <p className="mt-2 text-xs text-danger">{profilesError}</p> : null}

              <div className="mt-4 card-surface px-5 pt-3 pb-4">
                <GpmProfilesTable
                  profiles={profiles}
                  groups={groups}
                  selectedId={selectedProfileId}
                  runningProfileIds={runningProfileIds}
                  loading={profilesLoading}
                  onSelect={setSelectedProfileId}
                />
              </div>
            </>
          ) : (
            <>
              <div className="border-b border-border pb-4">
                <GpmGroupsToolbar
                  count={filteredGroups.length}
                  search={groupSearch}
                  loading={groupsLoading}
                  readOnly
                  onSearchChange={setGroupSearch}
                  onRefresh={handleRefresh}
                />
              </div>

              {groupsError ? <p className="mt-2 text-xs text-danger">{groupsError}</p> : null}

              <div className="mt-4 card-surface px-5 pt-3 pb-4">
                <GpmGroupsTable groups={filteredGroups} loading={groupsLoading} readOnly />
              </div>
            </>
          )}
        </div>
      </div>

      <AddGpmProfileModal
        open={showAddProfileModal}
        groups={groups}
        onClose={() => setShowAddProfileModal(false)}
        onSuccess={() => {
          toast.success('GPM profile created');
          handleRefresh();
        }}
      />

      <EditGpmProfileModal
        open={showEditProfileModal}
        profile={selectedProfile}
        groups={groups}
        onClose={() => setShowEditProfileModal(false)}
        onSuccess={() => {
          toast.success('GPM profile updated');
          handleRefresh();
        }}
      />

      <Modal
        open={showTestResultModal}
        onClose={() => {
          setShowTestResultModal(false);
          setTestResult(null);
        }}
        title="Gemini Test Result"
        footer={
          <Button
            size="sm"
            className="rounded-lg"
            onClick={() => {
              setShowTestResultModal(false);
              setTestResult(null);
            }}
          >
            Close
          </Button>
        }
      >
        {testResult ? (
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Profile</p>
              <p className="mt-1 text-neutral-200">{selectedProfile?.name ?? testResult.profileId}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Prompt</p>
              <p className="mt-1 text-neutral-300">{testResult.prompt}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Response</p>
              <pre className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-elevated p-3 text-neutral-200">
                {testResult.content || '(empty response)'}
              </pre>
            </div>
            <p className="text-xs text-neutral-500">
              Completed in {(testResult.elapsedMs / 1000).toFixed(1)}s — profile remains open.
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={showDeleteProfileModal}
        onClose={() => {
          if (deletingProfile) return;
          setShowDeleteProfileModal(false);
          setDeleteHardMode(false);
        }}
        title="Delete GPM Profile"
        footer={
          <>
            <Button
              variant="outlined"
              size="sm"
              className="rounded-lg"
              onClick={() => {
                setShowDeleteProfileModal(false);
                setDeleteHardMode(false);
              }}
              disabled={deletingProfile}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="rounded-lg"
              onClick={handleConfirmDeleteProfile}
              disabled={deletingProfile}
            >
              {deletingProfile ? 'Deleting…' : deleteHardMode ? 'Delete permanently' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-300">
          Delete profile &quot;{selectedProfile?.name ?? selectedProfileId}&quot;?
        </p>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
          <input
            type="checkbox"
            checked={deleteHardMode}
            onChange={(e) => setDeleteHardMode(e.target.checked)}
            disabled={deletingProfile}
            className="size-3.5 rounded border-border bg-surface accent-primary-500"
          />
          Permanently delete (mode 2 — database + storage)
        </label>
        <p className="mt-2 text-xs text-neutral-500">
          Unchecked uses mode 1 (database only).
        </p>
      </Modal>
    </div>
  );
}
